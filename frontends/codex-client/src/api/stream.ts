import { ApiError } from "./errors";
import type { ChatCompletionResult, ChatStreamEvent, ChatToolCall, TokenUsage } from "./types";

/**
 * 把 `choices[0].delta` 的一块块增量拼成完整结果。
 *
 * 三件必须做对的事（都是实测会踩的）：
 *   1. `delta.content` 与 `delta.reasoning_content` **要分开累积**，不能混进正文
 *      （DeepSeek-R1 / o1 风格会把思考过程放在 reasoning 字段）；
 *   2. `delta.tool_calls[].function.arguments` 是**按 index 拼接的 JSON 字符串**，
 *      每次只来一小段，必须按 index 累积，不能每次覆盖；
 *   3. 有些兼容实现压根不流式（返回一次性 JSON），或者把 `message` 而不是 `delta` 放在 choices 里，
 *      这里都按同一套事件吐出去，上层不用分叉。
 */

/** delta 里的文字字段可能是 string、null，也可能是 `[{type:"text",text}]` 形态 */
function readText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    let out = "";
    for (const part of value) {
      if (typeof part === "string") out += part;
      else if (part && typeof part === "object") {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string") out += text;
      }
    }
    return out;
  }
  return "";
}

/** 推理字段各家命名不一：DeepSeek 用 reasoning_content，OpenRouter 用 reasoning，部分网关用 thinking */
function readReasoning(source: Record<string, unknown>): string {
  return readText(source.reasoning_content) || readText(source.reasoning) || readText(source.thinking) || "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** OpenAI 用 prompt_tokens/completion_tokens；部分网关用 input_tokens/output_tokens */
export function normalizeUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const details = (record.completion_tokens_details ?? record.output_tokens_details ?? null) as Record<
    string,
    unknown
  > | null;
  const usage: TokenUsage = {
    promptTokens: numberOrNull(record.prompt_tokens) ?? numberOrNull(record.input_tokens),
    completionTokens: numberOrNull(record.completion_tokens) ?? numberOrNull(record.output_tokens),
    totalTokens: numberOrNull(record.total_tokens),
    reasoningTokens: details ? numberOrNull(details.reasoning_tokens) : null,
  };
  if (
    usage.promptTokens === null &&
    usage.completionTokens === null &&
    usage.totalTokens === null &&
    usage.reasoningTokens === null
  ) {
    return null;
  }
  return usage;
}

export interface ChatStreamAssembler {
  /** 处理一条 SSE 事件的 data 载荷；返回由它产生的增量事件 */
  push(data: string): ChatStreamEvent[];
  /** 流结束收尾：补发未收全的工具调用 + done */
  finish(): ChatStreamEvent[];
  /** 当前已拼出的完整结果 */
  result(): ChatCompletionResult;
}

export interface AssemblerOptions {
  /** 记日志/上报，不参与状态 */
  onUnknownChunk?: (payload: unknown) => void;
}

export function createChatStreamAssembler(options: AssemblerOptions = {}): ChatStreamAssembler {
  let content = "";
  let reasoning = "";
  const calls = new Map<number, ChatToolCall>();
  const completed = new Set<number>();
  let finishReason: string | null = null;
  let usage: TokenUsage | null = null;
  let model: string | null = null;
  let closed = false;
  let sawModel = false;
  let fallbackIndex = 0;

  function emitCompleted(before: number, out: ChatStreamEvent[]) {
    for (const call of calls.values()) {
      if (call.index < before && !completed.has(call.index)) {
        completed.add(call.index);
        out.push({ type: "tool_done", call: { ...call } });
      }
    }
  }

  function absorbToolCalls(rawCalls: unknown, out: ChatStreamEvent[]) {
    if (!Array.isArray(rawCalls)) return;
    for (const raw of rawCalls) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const index = typeof record.index === "number" ? record.index : fallbackIndex++;
      const fn = (record.function ?? null) as Record<string, unknown> | null;

      let call = calls.get(index);
      const isNew = !call;
      if (!call) {
        call = { index, id: "", name: "", arguments: "" };
        calls.set(index, call);
        // 出现更大的 index ⇒ 比它小的那些调用已经发完了
        emitCompleted(index, out);
      }

      const idDelta = typeof record.id === "string" ? record.id : "";
      if (idDelta) call.id = idDelta;
      const nameDelta = fn ? readText(fn.name) : "";
      // name 正常只在首个增量里出现；但确有实现把它拆开/重复发，按「相同忽略、不同追加」处理
      if (nameDelta && nameDelta !== call.name) {
        call.name = call.name === "" ? nameDelta : call.name + nameDelta;
      }
      const argsDelta = fn ? readText(fn.arguments) : "";
      if (argsDelta) call.arguments += argsDelta;

      if (!call.id) call.id = `call_${index}`; // 服务端没给 id 时给个稳定 id，供 UI 当 key
      if (isNew) out.push({ type: "tool_start", index, id: call.id, name: call.name });
      out.push({
        type: "tool_delta",
        index,
        id: idDelta || null,
        name: nameDelta || null,
        argumentsDelta: argsDelta,
      });
    }
  }

  /** 一次性 JSON 形态的 choice（服务端忽略 stream:true 时会出现） */
  function absorbMessage(message: Record<string, unknown>, out: ChatStreamEvent[]) {
    const text = readText(message.content);
    if (text) {
      content += text;
      out.push({ type: "content", delta: text });
    }
    const think = readReasoning(message);
    if (think) {
      reasoning += think;
      out.push({ type: "reasoning", delta: think });
    }
    absorbToolCalls(message.tool_calls, out);
  }

  function push(data: string): ChatStreamEvent[] {
    const out: ChatStreamEvent[] = [];
    const text = data.trim();
    if (!text) return out;
    if (text === "[DONE]") {
      closed = true;
      out.push({ type: "done" });
      return out;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("payload is not an object");
      }
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      throw new ApiError({
        kind: "protocol",
        message: `流式响应解析失败：收到一段不是合法 JSON 的数据（${text.slice(0, 120)}）。`,
        detail: text.slice(0, 300),
        cause: error,
      });
    }

    // 200 里塞 error 的情况（限流/额度用完常见）
    if (payload.error) {
      const detail = extractErrorText(payload.error);
      const kind = /rate|quota|limit|too many/i.test(detail) ? "rate_limit" : "server";
      throw new ApiError({
        kind,
        message: `服务端在流中返回错误：${detail || "未知错误"}`,
        detail,
      });
    }

    if (!sawModel && typeof payload.model === "string") {
      model = payload.model;
      sawModel = true;
      out.push({ type: "open", model });
    }

    const nextUsage = normalizeUsage(payload.usage);
    if (nextUsage) {
      usage = nextUsage;
      out.push({ type: "usage", usage: nextUsage });
    }

    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      // 纯 usage 分块（stream_options.include_usage）会走到这里
      if (!nextUsage && !payload.model) options.onUnknownChunk?.(payload);
      return out;
    }

    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message;
    if (message && typeof message === "object") absorbMessage(message as Record<string, unknown>, out);

    const delta = choice.delta;
    if (delta && typeof delta === "object") {
      const record = delta as Record<string, unknown>;
      const textDelta = readText(record.content);
      if (textDelta) {
        content += textDelta;
        out.push({ type: "content", delta: textDelta });
      }
      const thinkDelta = readReasoning(record);
      if (thinkDelta) {
        reasoning += thinkDelta;
        out.push({ type: "reasoning", delta: thinkDelta });
      }
      absorbToolCalls(record.tool_calls, out);
    }

    if (typeof choice.finish_reason === "string") {
      finishReason = choice.finish_reason;
      out.push({ type: "finish", reason: finishReason });
    }
    return out;
  }

  function finish(): ChatStreamEvent[] {
    const out: ChatStreamEvent[] = [];
    emitCompleted(Number.POSITIVE_INFINITY, out);
    if (!closed) {
      closed = true;
      out.push({ type: "done" });
    }
    return out;
  }

  return {
    push,
    finish,
    result() {
      return {
        content,
        reasoning,
        toolCalls: [...calls.values()].sort((a, b) => a.index - b.index).map((call) => ({ ...call })),
        finishReason,
        usage,
        model,
      };
    },
  };
}

function extractErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
  }
  return "";
}

/** 非流式响应体 → 统一结果 */
export function assembleChatCompletion(payload: unknown): ChatCompletionResult {
  if (!payload || typeof payload !== "object") {
    throw new ApiError({ kind: "protocol", message: "服务端返回的不是 JSON 对象，无法解析对话结果。" });
  }
  const record = payload as Record<string, unknown>;
  if (record.error) {
    const detail = extractErrorText(record.error);
    throw new ApiError({
      kind: /rate|quota|limit|too many/i.test(detail) ? "rate_limit" : "server",
      message: `服务端返回错误：${detail || "未知错误"}`,
      detail,
    });
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (first.message ?? {}) as Record<string, unknown>;
  const toolCalls: ChatToolCall[] = [];
  if (Array.isArray(message.tool_calls)) {
    message.tool_calls.forEach((raw, index) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const fn = (item.function ?? {}) as Record<string, unknown>;
      toolCalls.push({
        index,
        id: typeof item.id === "string" ? item.id : `call_${index}`,
        name: readText(fn.name),
        arguments: readText(fn.arguments),
      });
    });
  }

  const reasoningText = readReasoning(message) || readReasoning(first);
  return {
    content: readText(message.content),
    reasoning: reasoningText,
    toolCalls,
    finishReason: typeof first.finish_reason === "string" ? first.finish_reason : null,
    usage: normalizeUsage(record.usage),
    model: typeof record.model === "string" ? record.model : null,
  };
}
