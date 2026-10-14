import { normalizeApiConfig } from "./config";
import {
  ApiError,
  classifyStatus,
  describeNetworkError,
  extractServerMessage,
  isApiError,
  messageForStatus,
  parseRetryAfter,
  toApiError,
} from "./errors";
import { createSseDecoder } from "./sse";
import { assembleChatCompletion, createChatStreamAssembler } from "./stream";
import type {
  ApiConnectionConfig,
  ApiErrorKind,
  ChatCompletionResult,
  ChatMessageParam,
  ChatStreamEvent,
  ChatToolCall,
  ModelInfo,
  ModelListResult,
  ResolvedApiConfig,
} from "./types";
import { resolveEndpoints } from "./url";

/**
 * OpenAI 兼容客户端。
 *
 * ★ 全工程**唯一**发网络请求的地方：所有 `fetch` 都在这一个文件里。
 *   以后要换成 IPC / 主进程代理 / 换协议，只改这里，UI 与 runtime 不动。
 *
 * 依赖只有 fetch / ReadableStream / TextDecoder / AbortController —— 零第三方库，
 * 所以 Node 22 也能直接加载它跑真机自测（src/api/selftest.mjs）。
 *
 * 超时分两段（流式必须这样，否则长回答会被「总超时」误杀）：
 *   · `timeoutMs`     —— 连接 + 首包（拿到响应头之前）；
 *   · `idleTimeoutMs` —— 流式过程中两块之间的最大间隔，每来一块就重置。
 *   两段超时都是**未实测**的工程默认值：30s / 60s（见 config.ts）。
 */

export interface ChatRequest {
  messages: ChatMessageParam[];
  /** 覆盖配置里的模型名 */
  model?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  signal?: AbortSignal;
  /** 流式增量回调；一次性 JSON 降级时也会按同一套事件补发 */
  onEvent?: (event: ChatStreamEvent) => void;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** models = `/models` 可用；chat = `/models` 不可用但对话端点通；none = 都不通 */
  mode: "models" | "chat" | "none";
  models: ModelInfo[];
  latencyMs: number;
  error: { kind: ApiErrorKind; message: string } | null;
}

export interface ApiClient {
  readonly config: ResolvedApiConfig;
  /** 用 SSE 流式请求（服务端不流式时自动降级成一次性 JSON） */
  streamChat(request: ChatRequest): Promise<ChatCompletionResult>;
  /** 一次性 JSON 请求（服务端坚持流式时也能收） */
  completeChat(request: ChatRequest): Promise<ChatCompletionResult>;
  /** 从不抛异常：拉不到就降级成空列表 + error */
  listModels(options?: { signal?: AbortSignal }): Promise<ModelListResult>;
  /** 设置页「测试连接」用 */
  testConnection(options?: { signal?: AbortSignal }): Promise<ConnectionTestResult>;
}

function buildHeaders(cfg: ResolvedApiConfig, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
  };
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  // 自定义请求头优先级最高：可以覆盖 Authorization（例如 Azure 的 api-key / 部分网关的 x-api-key）
  for (const [key, value] of Object.entries(cfg.headers)) {
    const name = key.trim();
    if (!name) continue;
    headers[name] = value;
  }
  return headers;
}

/** 把外部 AbortSignal 转发到内部 controller（不能直接用 AbortSignal.any：要保住自定义 abort reason） */
function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => {};
  const relay = () => target.abort(source.reason);
  if (source.aborted) {
    relay();
    return () => {};
  }
  source.addEventListener("abort", relay, { once: true });
  return () => source.removeEventListener("abort", relay);
}

function seconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  const detail = extractServerMessage(body);
  const kind = classifyStatus(response.status);
  return new ApiError({
    kind,
    status: response.status,
    message: messageForStatus(kind, response.status, detail),
    detail,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")) ?? undefined,
  });
}

/** 建一个「有超时的 fetch」：只用在一个完整请求上（非流式 / GET） */
async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  external: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const detach = forwardAbort(external, controller);
  let timeoutError: ApiError | null = null;
  const timer = setTimeout(() => {
    timeoutError = new ApiError({
      kind: "timeout",
      message: `请求超时（${seconds(timeoutMs)} 秒没有响应）：请检查端点是否可达，或调大超时时间。`,
      detail: url,
    });
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timeoutError) throw timeoutError;
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (isApiError(reason)) throw reason;
      throw new ApiError({ kind: "aborted", message: "已停止。", cause: error });
    }
    throw describeNetworkError(error, { url });
  } finally {
    clearTimeout(timer);
    detach();
  }
}

/**
 * 内部消息模型（camelCase，跟 @/lib/types 对齐）→ 线上格式（snake_case）。
 * 这里是最容易「本地看着对、发出去就错」的一步：`toolCalls` 必须变成 `tool_calls`，
 * `toolCallId` 必须变成 `tool_call_id`，否则服务端会报参数错误或直接忽略工具结果。
 */
function toWireMessage(message: ChatMessageParam): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.role === "tool" && message.toolCallId) wire.tool_call_id = message.toolCallId;
  if (message.toolCalls && message.toolCalls.length > 0) {
    wire.tool_calls = message.toolCalls.map(toApiToolCall);
  }
  return wire;
}

function buildPayload(
  cfg: ResolvedApiConfig,
  request: ChatRequest,
  stream: boolean,
): Record<string, unknown> {
  const model = (request.model ?? cfg.model).trim();
  if (!model) {
    throw new ApiError({
      kind: "config",
      message: "尚未配置模型名：请在「设置 → 自定义 API」里填写要使用的模型。",
    });
  }

  const messages: Record<string, unknown>[] = [];
  /*
   * system 消息 = 系统提示词 + 「关于你」（顺序固定：提示词在前）。
   * 后者出处是官方「个性化」页的自定义指令；本工程把它并进自定义 API
   * （用户 2026-10-15 指定：配置/个性化与自定义 API 整合）。
   */
  const system = [cfg.systemPrompt.trim(), cfg.userProfile.trim()].filter(Boolean).join("\n\n");
  if (system) messages.push({ role: "system", content: system });
  for (const message of request.messages) messages.push(toWireMessage(message));

  const payload: Record<string, unknown> = { model, messages, stream };
  const temperature = request.temperature ?? cfg.temperature;
  const maxTokens = request.maxTokens ?? cfg.maxTokens;
  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;
  // 推理强度：官方「配置」页那一档；空串不发（不兼容的网关不会因此 400）
  if (cfg.reasoningEffort.trim()) payload.reasoning_effort = cfg.reasoningEffort.trim();
  // 默认**不发** stream_options：部分兼容实现遇到不认识的字段会直接 400。
  // 想要流式 usage 的品牌可以在设置里打开（config.includeUsage）。
  if (stream && cfg.includeUsage) payload.stream_options = { include_usage: true };
  return payload;
}

/** 一次性结果 → 与流式一致的事件序列（保证 runtime 只有一条代码路径） */
function emitResultAsEvents(result: ChatCompletionResult, emit: (event: ChatStreamEvent) => void) {
  emit({ type: "open", model: result.model });
  if (result.reasoning) emit({ type: "reasoning", delta: result.reasoning });
  if (result.content) emit({ type: "content", delta: result.content });
  for (const call of result.toolCalls) {
    emit({ type: "tool_start", index: call.index, id: call.id, name: call.name });
    emit({ type: "tool_done", call });
  }
  if (result.usage) emit({ type: "usage", usage: result.usage });
  emit({ type: "finish", reason: result.finishReason });
  emit({ type: "done" });
}

/** 跑 SSE：拿到头之后按「空闲超时」重置计时，逐块解码 */
async function consumeStream(
  cfg: ResolvedApiConfig,
  response: Response,
  onEvent: ((event: ChatStreamEvent) => void) | undefined,
  arm: (ms: number, message: string) => void,
): Promise<ChatCompletionResult> {
  const body = response.body;
  if (!body) {
    throw new ApiError({ kind: "protocol", message: "服务端连通了但没有响应体（ReadableStream 为空）。" });
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const sse = createSseDecoder();
  const assembler = createChatStreamAssembler();
  const emit = (events: ChatStreamEvent[]) => {
    for (const event of events) onEvent?.(event);
  };

  arm(
    cfg.idleTimeoutMs,
    `流式响应中断：超过 ${seconds(cfg.idleTimeoutMs)} 秒没有收到新数据（连接可能已被服务端悄悄关掉）。`,
  );

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // 收到数据 ⇒ 重置空闲计时
      arm(
        cfg.idleTimeoutMs,
        `流式响应中断：超过 ${seconds(cfg.idleTimeoutMs)} 秒没有收到新数据（连接可能已被服务端悄悄关掉）。`,
      );
      if (!value || value.length === 0) continue;
      const events = sse.push(decoder.decode(value, { stream: true }));
      for (const event of events) {
        if (event.event === "error") {
          const detail = extractServerMessage(event.data);
          throw new ApiError({
            kind: "server",
            message: `服务端推送了 error 事件：${detail || "未知错误"}`,
            detail,
          });
        }
        emit(assembler.push(event.data));
      }
    }

    for (const event of sse.flush()) emit(assembler.push(event.data));
    emit(assembler.finish());
    return assembler.result();
  } finally {
    // 中断 / 出错时立刻释放连接，避免服务端继续推数据
    try {
      await reader.cancel();
    } catch {
      // 已经关掉了，忽略
    }
  }
}

async function performRequest(
  cfg: ResolvedApiConfig,
  request: ChatRequest,
  stream: boolean,
): Promise<ChatCompletionResult> {
  const { chatUrl } = resolveEndpoints(cfg.baseUrl);
  const payload = buildPayload(cfg, request, stream);

  const controller = new AbortController();
  const detach = forwardAbort(request.signal, controller);
  let timeoutError: ApiError | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const disarm = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const arm = (ms: number, message: string) => {
    disarm();
    timer = setTimeout(() => {
      timeoutError = new ApiError({ kind: "timeout", message, detail: chatUrl });
      controller.abort(timeoutError);
    }, ms);
  };

  try {
    arm(
      cfg.timeoutMs,
      `连接超时（${seconds(cfg.timeoutMs)} 秒）：请检查 Base URL、端口与网络，或调大超时时间。`,
    );
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: buildHeaders(cfg, stream),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    disarm();

    if (!response.ok) throw await errorFromResponse(response);

    // ★ 按**响应**的 content-type 决定怎么读，而不是按我们请求了什么：
    //   有的服务端忽略 stream:true 直接回 JSON，也有服务端无视 stream:false 坚持推 SSE。
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const looksLikeSse =
      contentType.includes("text/event-stream") || (stream && !contentType.includes("json"));

    if (looksLikeSse) {
      return await consumeStream(cfg, response, request.onEvent, arm);
    }

    const json: unknown = await response.json();
    const result = assembleChatCompletion(json);
    if (request.onEvent) emitResultAsEvents(result, request.onEvent);
    return result;
  } catch (error) {
    if (timeoutError) throw timeoutError;
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (isApiError(reason)) throw reason;
      throw new ApiError({ kind: "aborted", message: "已停止生成。", cause: error });
    }
    throw toApiError(error, { url: chatUrl, aborted: request.signal?.aborted });
  } finally {
    disarm();
    detach();
  }
}

function normalizeModel(raw: unknown): ModelInfo | null {
  if (typeof raw === "string") return { id: raw, ownedBy: null, created: null };
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : typeof record.name === "string" ? record.name : "";
  if (!id) return null;
  return {
    id,
    ownedBy: typeof record.owned_by === "string" ? record.owned_by : null,
    created: typeof record.created === "number" ? record.created : null,
  };
}

export function createApiClient(config: ApiConnectionConfig | ResolvedApiConfig): ApiClient {
  const cfg = normalizeApiConfig(config);

  async function listModels(options: { signal?: AbortSignal } = {}): Promise<ModelListResult> {
    const started = Date.now();
    let modelsUrl = "";
    try {
      modelsUrl = resolveEndpoints(cfg.baseUrl).modelsUrl;
      const response = await fetchWithDeadline(
        modelsUrl,
        { method: "GET", headers: buildHeaders(cfg, false) },
        cfg.timeoutMs,
        options.signal,
      );
      if (!response.ok) throw await errorFromResponse(response);
      const json: unknown = await response.json();
      const rawList = Array.isArray(json)
        ? json
        : Array.isArray((json as { data?: unknown })?.data)
          ? ((json as { data: unknown[] }).data as unknown[])
          : [];
      const models: ModelInfo[] = [];
      for (const raw of rawList) {
        const model = normalizeModel(raw);
        if (model) models.push(model);
      }
      models.sort((a, b) => a.id.localeCompare(b.id));
      return { ok: true, models, error: null, latencyMs: Date.now() - started };
    } catch (error) {
      const apiError = toApiError(error, { url: modelsUrl, aborted: options.signal?.aborted });
      return {
        ok: false,
        models: [],
        error: { kind: apiError.kind, message: apiError.message },
        latencyMs: Date.now() - started,
      };
    }
  }

  return {
    config: cfg,
    streamChat: (request) => performRequest(cfg, request, true),
    completeChat: (request) => performRequest(cfg, request, false),
    listModels,

    /** 测试连接：先试 /models；有的兼容服务没有 /models，再退一步用 1 token 的对话探活 */
    async testConnection(options = {}) {
      const modelList = await listModels(options);
      if (modelList.ok) {
        return {
          ok: true,
          mode: "models" as const,
          models: modelList.models,
          latencyMs: modelList.latencyMs,
          error: null,
        };
      }
      const started = Date.now();
      try {
        await performRequest(
          cfg,
          {
            messages: [{ role: "user", content: "ping" }],
            maxTokens: 1,
            signal: options.signal,
          },
          false,
        );
        return { ok: true, mode: "chat" as const, models: [], latencyMs: Date.now() - started, error: null };
      } catch (error) {
        const apiError = toApiError(error, { url: resolveEndpoints(cfg.baseUrl).chatUrl });
        return {
          ok: false,
          mode: "none" as const,
          models: [],
          latencyMs: Date.now() - started,
          error: { kind: apiError.kind, message: apiError.message },
        };
      }
    },
  };
}

/** 便捷函数：不想持有 client 时直接用（内部同样是 createApiClient） */
export function streamChat(
  config: ApiConnectionConfig | ResolvedApiConfig,
  request: ChatRequest,
): Promise<ChatCompletionResult> {
  return createApiClient(config).streamChat(request);
}

/** 工具调用 → 发回服务端的形态 */
export function toApiToolCall(call: ChatToolCall) {
  return {
    id: call.id,
    type: "function" as const,
    function: { name: call.name, arguments: call.arguments },
  };
}
