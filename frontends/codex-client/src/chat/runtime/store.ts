import type { ApiErrorKind } from "@/api/types";
import type { ConversationRecord, RuntimeMessage } from "./types";

/**
 * 会话与消息的本地持久化（localStorage）。
 *
 * 键名沿用工程的 `codex.*` 约定：
 *   codex.conversations        → ConversationRecord[]（索引，侧栏列表用）
 *   codex.messages.<会话 id>    → RuntimeMessage[]
 *
 * 为什么按会话分 key：一次流式会话可能有上百条消息，整份 JSON 反复读写会卡；
 * 分开之后每次只重写当前会话那一份。
 *
 * 所有读写都不抛异常：localStorage 可能被隐私模式 / 配额 / 策略禁掉，
 * 那种情况下对话照样能跑，只是刷新后不留痕（降级但不崩）。
 */

export const CONVERSATIONS_STORAGE_KEY = "codex.conversations";
export const MESSAGES_STORAGE_PREFIX = "codex.messages.";

/** 标题最长字符数（未实测：官方没有这个功能，取一个能放进侧栏一行的长度） */
const TITLE_MAX = 40;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function messagesKey(conversationId: string): string {
  return MESSAGES_STORAGE_PREFIX + conversationId;
}

/** 首条用户消息 → 会话标题（官方侧栏是一行省略，这里先按字符截断） */
export function deriveTitle(text: string, fallback = "新聊天"): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return fallback;
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 从 localStorage 读出来的东西一律当作不可信输入清洗 */
function sanitizeMessage(raw: unknown): RuntimeMessage | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const role = raw.role;
  const content = typeof raw.content === "string" ? raw.content : "";
  if (!id) return null;
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  const message: RuntimeMessage = {
    id,
    conversationId: typeof raw.conversationId === "string" ? raw.conversationId : "",
    role,
    content,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
  if (typeof raw.reasoning === "string" && raw.reasoning) message.reasoning = raw.reasoning;
  if (Array.isArray(raw.toolCalls)) {
    message.toolCalls = raw.toolCalls.filter(isRecord).map((call) => ({
      id: typeof call.id === "string" ? call.id : "call_unknown",
      name: typeof call.name === "string" ? call.name : "",
      summary: typeof call.summary === "string" ? call.summary : "",
      status:
        call.status === "running" || call.status === "success" || call.status === "error"
          ? call.status
          : "pending",
      input: typeof call.input === "string" ? call.input : undefined,
      output: typeof call.output === "string" ? call.output : undefined,
    }));
  }
  // 上次关窗口时正在流式的消息：落盘时不该带 streaming 标记
  if (raw.aborted === true) message.aborted = true;
  if (raw.error && isRecord(raw.error) && typeof raw.error.message === "string") {
    message.error = {
      kind: typeof raw.error.kind === "string" ? (raw.error.kind as ApiErrorKind) : "unknown",
      message: raw.error.message,
      status: typeof raw.error.status === "number" ? raw.error.status : null,
      detail: typeof raw.error.detail === "string" ? raw.error.detail : "",
      retryable: raw.error.retryable === true,
    };
  }
  return message;
}

export function readMessages(conversationId: string | null | undefined): RuntimeMessage[] {
  if (!conversationId) return [];
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(messagesKey(conversationId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RuntimeMessage[] = [];
    for (const item of parsed) {
      const message = sanitizeMessage(item);
      if (message) {
        message.conversationId = conversationId;
        out.push(message);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** 落盘前把「正在流式」这类瞬时状态清掉：刷新后不该出现一条永远转圈的消息 */
export function sanitizeMessagesForStorage(messages: RuntimeMessage[]): RuntimeMessage[] {
  return messages.map((message) => {
    const next: RuntimeMessage = { ...message };
    delete next.phase;
    delete next.streaming;
    return next;
  });
}

export function writeMessages(conversationId: string | null | undefined, messages: RuntimeMessage[]): void {
  if (!conversationId) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(messagesKey(conversationId), JSON.stringify(sanitizeMessagesForStorage(messages)));
  } catch {
    // 配额满：忽略，内存里照常
  }
}

let conversationsCache: ConversationRecord[] | null = null;
const conversationListeners = new Set<() => void>();

function sanitizeConversation(raw: unknown): ConversationRecord | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  return {
    id,
    title: typeof raw.title === "string" && raw.title ? raw.title : "新聊天",
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    messageCount: typeof raw.messageCount === "number" ? raw.messageCount : 0,
    origin: "runtime",
  };
}

export function listConversations(): ConversationRecord[] {
  if (conversationsCache) return conversationsCache;
  const store = storage();
  if (!store) {
    conversationsCache = [];
    return conversationsCache;
  }
  try {
    const raw = store.getItem(CONVERSATIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const out: ConversationRecord[] = [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const record = sanitizeConversation(item);
        if (record) out.push(record);
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    conversationsCache = out;
  } catch {
    conversationsCache = [];
  }
  return conversationsCache;
}

function persistConversations(records: ConversationRecord[]) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 同上：写不进去就算了
  }
}

export function subscribeConversations(listener: () => void): () => void {
  conversationListeners.add(listener);
  return () => {
    conversationListeners.delete(listener);
  };
}

/** 侧栏要的「有内容的会话列表」：只列 runtime 真实产生过的会话，按更新时间倒序 */
export function upsertConversation(record: ConversationRecord): ConversationRecord[] {
  const current = listConversations().filter((item) => item.id !== record.id);
  const next = [record, ...current].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  conversationsCache = next;
  persistConversations(next);
  for (const listener of conversationListeners) listener();
  return next;
}

export function removeConversation(conversationId: string): void {
  const next = listConversations().filter((item) => item.id !== conversationId);
  conversationsCache = next;
  persistConversations(next);
  const store = storage();
  if (store) {
    try {
      store.removeItem(messagesKey(conversationId));
    } catch {
      // 忽略
    }
  }
  for (const listener of conversationListeners) listener();
}

export function createConversationRecord(options: {
  id: string;
  title?: string;
  at?: string;
}): ConversationRecord {
  const at = options.at ?? new Date().toISOString();
  return {
    id: options.id,
    title: options.title ? deriveTitle(options.title) : "新聊天",
    createdAt: at,
    updatedAt: at,
    messageCount: 0,
    origin: "runtime",
  };
}

export function updateConversationRecord(
  conversationId: string,
  patch: { title?: string; updatedAt?: string; messageCount?: number },
): ConversationRecord | null {
  const existing = listConversations().find((item) => item.id === conversationId);
  if (!existing) return null;
  const next: ConversationRecord = {
    ...existing,
    title: patch.title ?? existing.title,
    updatedAt: patch.updatedAt ?? existing.updatedAt,
    messageCount: patch.messageCount ?? existing.messageCount,
  };
  upsertConversation(next);
  return next;
}

/** 仅供测试：把缓存清掉，强制下次从 localStorage 重新读 */
export function invalidateConversationCache(): void {
  conversationsCache = null;
}
