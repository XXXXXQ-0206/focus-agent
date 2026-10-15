import type { Message, ToolCall } from "@/lib/types";

import type { ErrorNode } from "./blocks";

/**
 * 会话消息模型 —— 「一条消息长什么样」以及**怎么把它翻译成官方块**。
 *
 * 来历：2026-10-16 清掉本工程早期的本机会话运行时（`src/chat/runtime/**` 的状态机、
 * `src/api/**` 的直连客户端、未挂路由的 ChatHome / ChatConversation）时，从
 * `runtime/types.ts` 里保留下来的**唯一还活着的一部分** —— 渲染侧（ConversationView /
 * Message / ToolActivityGroup / turn-changes）与 ARTEX 桥接侧（artex/codex-adapter）都用它。
 *
 * 关键约定：`RuntimeMessage` **继承** `@/lib/types` 的 `Message`，
 * 所以 `src/chat/Message.tsx` / `Markdown.tsx` 不用改一行就能渲染真实消息；
 * 多出来的字段（phase / error / usage）都是可选的，旧组件忽略即可。
 */

/** 一轮生成的阶段。idle 之外都算「忙」，Composer 的停止键据此切换 */
export type TurnPhase =
  | "idle"
  | "sending" // 已发出请求，还没收到第一个字节
  | "streaming" // 正在收增量
  | "tool_call" // 模型要求调用工具，正在执行
  | "tool_result" // 工具结果已拿到，准备再问一轮
  | "done"
  | "error"
  | "aborted";

export const ACTIVE_PHASES: readonly TurnPhase[] = ["sending", "streaming", "tool_call", "tool_result"];

export function isActivePhase(phase: TurnPhase): boolean {
  return ACTIVE_PHASES.indexOf(phase) !== -1;
}

/** 给 Composer 用的两态：只有「忙」和「不忙」 */
export function statusOf(phase: TurnPhase): "idle" | "streaming" {
  return isActivePhase(phase) ? "streaming" : "idle";
}

/**
 * 错误分类。原属已删除的 `@/api/types`（直连客户端），这里是**剩下的唯一使用者**
 * 需要的取值集合：决定给用户看的中文文案，以及「值不值得重试」。
 */
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

/** 流式过程中逐步拼出来的工具调用（arguments 是**按 index 拼接**的字符串） */
export interface ChatToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

/** 错误的可序列化形态（ApiError 本身带 cause，不适合进 state / localStorage） */
export interface RuntimeErrorInfo {
  kind: ApiErrorKind;
  message: string;
  status: number | null;
  detail: string;
  retryable: boolean;
}

export interface RuntimeMessage extends Message {
  /** 这条消息所处轮次的阶段（最后一条助手消息上最有意义） */
  phase?: TurnPhase;
  /**
   * 错误信息。**UI 直接渲染它**（独立错误条）：Message.tsx 用官方 ErrorBlock（SPEC §12）渲染，
   * 映射函数是下面的 `toDisplayErrorNode`。
   * ⚠️ 错误文案**不**回填进 content，所以「正文为空 + error 非空」是常见组合 ——
   * 渲染方必须认这个字段，否则用户看不到任何报错。
   */
  error?: RuntimeErrorInfo | null;
  finishReason?: string | null;
  usage?: TokenUsage | null;
  /**
   * 推理段是否已经结束（段级事件，区别于轮级的 `streaming`）。
   *
   * 为什么需要它：官方推理项的数据模型是 `{content, completed}`（SPEC §3.1），
   * `completed` 是**段级**的 —— 模型停止输出思考、开始输出正文/工具调用时就该翻牌。
   * 而 block-adapter 只能用轮级的 `message.streaming` 推状态，于是整轮都在「思考中」：
   * 真机 500ms 采样实测到 1535ms 时正文已经流出 39 字，推理块仍是「思考中 + 自动展开」，
   * 到 2047ms 收尾才跳「已思考」。这里补一个段级信号给渲染方用。
   */
  reasoningComplete?: boolean;
  /** 被用户中止（不算错误） */
  aborted?: boolean;
  /** 编辑重发时保留原文，便于「撤销编辑」以后做 */
  editedFrom?: string;
}

/**
 * 一条错误 → 官方错误块的输入（SPEC-CONVERSATION-BLOCKS.md §12）。
 *
 * 出处与推断边界：
 *   · `title` 的英文原文确证 = `System error` / `Stream error`（SPEC §12），
 *     但 zip 里没有 zh-CN 译文 → 这里的「请求失败」是**推断译文**，与 SPEC §13.2 的口径一致；
 *   · `message` / `additionalDetails` 是 SPEC §12 的「正文 + 详情」；
 *   · `defaultExpanded: true` —— SPEC §12 的呈现是「段落 + 正文」（正文直接可见），
 *     而折叠骨架的完成态默认是收起的（SPEC §2.2：isExpanded = userExpanded，初始 false），
 *     不展开就等于把错误藏在一次点击后面。
 */
export function toDisplayErrorNode(error: RuntimeErrorInfo, messageId: string): ErrorNode {
  return {
    kind: "error",
    id: `${messageId}-error`,
    status: "failed",
    title: "请求失败", // 推断译文（en: Stream error / System error，SPEC §12）
    message: error.message,
    additionalDetails: error.detail || undefined,
    defaultExpanded: true,
  };
}

/** 把流式累积出来的调用转成 UI 能渲染的 ToolCall（@/lib/types 的形状） */
export function toDisplayToolCall(call: ChatToolCall, status: ToolCall["status"]): ToolCall {
  return {
    id: call.id,
    name: call.name || "工具调用",
    summary: summarizeArguments(call.arguments),
    status,
    input: call.arguments,
  };
}

/** 折叠态那一行摘要：优先取 JSON 里第一个有意义的字符串值，取不到就截断原始参数 */
export function summarizeArguments(args: string, maxLength = 72): string {
  const text = (args ?? "").trim();
  if (!text) return "参数流式接收中…";
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      for (const key of ["command", "path", "query", "url", "file", "pattern", "prompt", "city"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, maxLength);
      }
      const first = Object.values(record).find((value) => typeof value === "string" && value.trim());
      if (typeof first === "string") return first.trim().slice(0, maxLength);
    }
  } catch {
    // 参数还没收全：退化成原文截断
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
