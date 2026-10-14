/**
 * 自定义 API 接入 —— 类型定义。
 *
 * 背景：官方 Codex Desktop 走的是 Electron 主进程里的 app-server（JSON-RPC + 自有协议），
 * 发行产物里**没有**任何 HTTP/SSE 客户端代码（全包搜不到 `text/event-stream`）。
 * 因此本目录是为「设置页里填自己的 OpenAI 兼容端点」这一新增能力从零写的，
 * **所有默认数值都标注为「未实测」——它们不是官方数值，只是工程自定值**。
 *
 * 硬约束（为什么这么写）：
 *   1. 只用 `fetch` + `ReadableStream` + `TextDecoder` + `AbortController`，**零运行时依赖**；
 *   2. 不 import React、不 import `@/lib/*`（连类型也不 import），
 *      这样 Node 22 自带的 `module.stripTypeScriptTypes` 能直接加载它做自测
 *      （见 `src/api/selftest.mjs`，真的起 HTTP 服务跑，不是 mock 断言）。
 */

/** 错误分类：决定给用户看的中文文案，以及「值不值得重试」 */
export type ApiErrorKind =
  | "config" // 本地配置问题（没填地址 / 地址格式不对）
  | "aborted" // 用户主动停止
  | "timeout" // 连接超时 / 流式空闲超时
  | "network" // 连不上（DNS / 端口 / 证书 / 断网）
  | "auth" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "bad_request" // 400 / 422 等
  | "rate_limit" // 429
  | "server" // 5xx
  | "protocol" // 连上了但响应不是合法的 SSE / JSON
  | "unknown";

/** token 用量（OpenAI / DeepSeek 兼容字段；服务端不一定给） */
export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** DeepSeek-R1 等会单独报推理 token（`completion_tokens_details.reasoning_tokens`） */
  reasoningTokens: number | null;
}

/** 请求侧的配置（设置页要写入的字段就是它） */
export interface ApiConnectionConfig {
  /** 形如 `https://api.deepseek.com` / `http://127.0.0.1:8000/v1`，也接受填完整端点 */
  baseUrl: string;
  /** 本地推理服务通常不需要；留空则不发送 Authorization 头 */
  apiKey?: string;
  model: string;
  /** 自定义请求头（如 `api-key`、`X-...`），会覆盖同名默认头 */
  headers?: Record<string, string>;
  /** 连接 + 首包超时（ms）。未实测：工程默认 30000 */
  timeoutMs?: number;
  /** 流式过程中两个分块之间的最大间隔（ms）。未实测：工程默认 60000 */
  idleTimeoutMs?: number;
  /** 是否用 SSE 流式；关掉就是一次性 JSON */
  stream?: boolean;
  temperature?: number | null;
  maxTokens?: number | null;
  /** 每次请求自动前置的 system 消息；留空则不发送 */
  systemPrompt?: string;
  /** 「关于你（背景与偏好）」：与系统提示词拼成同一条 system 消息（顺序：提示词 → 关于你） */
  userProfile?: string;
  /** 推理强度 → 请求体 `reasoning_effort`；空串 = 不发送该字段 */
  reasoningEffort?: string;
  /**
   * 是否发送 `stream_options: {include_usage: true}`。
   * 默认 **false**：关闭状态的兼容性最好 —— 部分廉价网关遇到不认识的字段直接 400。
   * 打开后流式响应最后会多一个 usage 分块。
   */
  includeUsage?: boolean;
}

/** `normalizeApiConfig()` 之后的形态：可选字段全部填好 */
export interface ResolvedApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
  timeoutMs: number;
  idleTimeoutMs: number;
  stream: boolean;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string;
  userProfile: string;
  reasoningEffort: string;
  includeUsage: boolean;
}

/** 发往 `/chat/completions` 的单条消息（**内部形态**，camelCase；发出去之前由 client 转成线上 snake_case） */
export interface ChatMessageParam {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** role=tool 时必填：对应的 tool_call id（线上字段名 `tool_call_id`） */
  toolCallId?: string;
  /** role=assistant 且带工具调用时。这里用**扁平**的 ChatToolCall，避免上层再记一套嵌套结构 */
  toolCalls?: ChatToolCall[];
}

export interface ChatToolCallParam {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** 流式过程中逐步拼出来的工具调用（arguments 是**按 index 拼接**的字符串） */
export interface ChatToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

/** 一次请求的完整结果（流式与非流式都归一到这个形状） */
export interface ChatCompletionResult {
  content: string;
  reasoning: string;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
  usage: TokenUsage | null;
  model: string | null;
}

/**
 * 客户端向上吐的增量事件。
 * runtime 只认这些事件，不关心下面到底是 SSE 还是一次性 JSON —— 换协议只改 client。
 */
export type ChatStreamEvent =
  | { type: "open"; model: string | null }
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  /** 首次见到某个 tool_call 的 index（此时可能只有 id，name 还没到） */
  | { type: "tool_start"; index: number; id: string; name: string }
  /** 工具调用的某个字段来了增量（arguments 要拼接） */
  | { type: "tool_delta"; index: number; id: string | null; name: string | null; argumentsDelta: string }
  /** 某个工具调用已经收全（参数不再变化） */
  | { type: "tool_done"; call: ChatToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "finish"; reason: string | null }
  | { type: "done" };

/** `GET /models` 的一条记录 */
export interface ModelInfo {
  id: string;
  ownedBy: string | null;
  created: number | null;
}

/** `listModels()` 从不抛异常：失败就降级成空列表 + error（设置页要能优雅显示） */
export interface ModelListResult {
  ok: boolean;
  models: ModelInfo[];
  error: { kind: ApiErrorKind; message: string } | null;
  /** 请求耗时（ms），用于设置页的「测试连接」显示 */
  latencyMs: number;
}
