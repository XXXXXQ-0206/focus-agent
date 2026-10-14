import type { ApiErrorKind, ChatToolCall, TokenUsage } from "@/api/types";
import type { ErrorNode } from "@/chat/blocks";
import type { Message, ToolCall } from "@/lib/types";

/**
 * 会话运行时的对外类型。
 *
 * 关键约定：`RuntimeMessage` **继承** `@/lib/types` 的 `Message`，
 * 所以 `src/chat/Message.tsx` / `Markdown.tsx` 不用改一行就能渲染真实流式消息；
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

/** 错误的可序列化形态（ApiError 本身有 cause，不适合进 state / localStorage） */
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
   * ⚠️ runtime **不再**把错误文案回填进 content（曾经兜底过），所以「正文为空 + error 非空」
   * 是常见组合 —— 渲染方必须认这个字段，否则用户看不到任何报错。
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
   *
   * ⚠️ 翻牌时机是**推断**（SPEC 没写 `completed` 具体何时置位）：取「第一个 content /
   *    tool_call 增量」为界；模型若交错输出思考与正文，会表现成思考提前收束。
   */
  reasoningComplete?: boolean;
  /** 被用户中止（不算错误） */
  aborted?: boolean;
  /** 编辑重发时保留原文，便于「撤销编辑」以后做 */
  editedFrom?: string;
}

export interface RuntimeState {
  /** 草稿态（首页还没落会话）为 null；首次发送后会被填上并 adopt 到真实会话 id */
  conversationId: string | null;
  messages: RuntimeMessage[];
  phase: TurnPhase;
  /** 最近一次「非中断」错误；中断不写这里 */
  error: RuntimeErrorInfo | null;
  /** 正在流式写入的助手消息 id（没有则为 null） */
  activeMessageId: string | null;
  /** 工具回环已进行的轮数 */
  round: number;
  updatedAt: number;
}

/**
 * 会话索引记录。
 * 与 `@/lib` 里的 mock `Conversation` 字段对齐（id/title/updatedAt + pinned/unread/running），
 * 额外带 messageCount / origin，方便侧栏区分「本次运行产生的真实会话」与「官方样例数据」。
 */
export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** runtime = 由本工程对话运行时真实产生 */
  origin: "runtime";
}

/** 工具执行器的入参 */
export interface ToolExecutionRequest {
  id: string;
  name: string;
  /** 模型给的原始 arguments 字符串（JSON 文本，可能不合法） */
  arguments: string;
}

/** 工具执行器：返回给模型看的文本结果 */
export type ToolExecutor = (request: ToolExecutionRequest) => string | Promise<string>;

/** 状态机的全部输入。runtime 只负责把这些动作喂进来，状态怎么变由 reducer 决定 */
export type RuntimeAction =
  | { type: "hydrate"; conversationId: string | null; messages: RuntimeMessage[]; updatedAt?: number }
  | { type: "turn/start"; user: RuntimeMessage; assistant: RuntimeMessage; at: number }
  | { type: "message/append"; message: RuntimeMessage }
  | { type: "message/patch"; id: string; patch: Partial<RuntimeMessage> }
  | { type: "delta"; id: string; content?: string; reasoning?: string }
  | { type: "tool/upsert"; id: string; call: ToolCall }
  | { type: "phase"; phase: TurnPhase; activeMessageId?: string | null }
  | {
      type: "turn/finish";
      id: string;
      phase: TurnPhase;
      finishReason: string | null;
      usage: TokenUsage | null;
      at: number;
    }
  | { type: "turn/error"; id: string; error: RuntimeErrorInfo }
  /** 工具回环轮数（RuntimeState.round 的**唯一**写入点） */
  | { type: "round"; round: number }
  | { type: "truncate"; fromId: string; at: number }
  | { type: "clear"; at: number };

/**
 * 一条错误 → 官方错误块的输入（SPEC-CONVERSATION-BLOCKS.md §12）。
 *
 * 为什么放在 runtime 而不是 Message.tsx：这样它和 `toDisplayToolCall` 一样能被
 * 无 React 的自测直接调用（node src/chat/runtime/selftest.mjs），映射有没有接错不靠肉眼看。
 *
 * 出处与推断边界：
 *   · `title` 的英文原文确证 = `System error` / `Stream error`（SPEC §12），
 *     但 zip 里没有 zh-CN 译文 → 这里的「请求失败」是**推断译文**，与 SPEC §13.2 的口径一致；
 *   · `message` / `additionalDetails` 是 SPEC §12 的「正文 + 详情」，数据来自 errors.ts 的中文文案；
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
