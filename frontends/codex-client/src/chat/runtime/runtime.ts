import { type ApiClient, createApiClient } from "@/api/client";
import { getApiConfig, normalizeApiConfig } from "@/api/config";
import { toApiError } from "@/api/errors";
import type {
  ChatMessageParam,
  ChatStreamEvent,
  ChatToolCall,
  ResolvedApiConfig,
  TokenUsage,
} from "@/api/types";
import type { Message } from "@/lib/types";
import { createIdleState, findPreviousUserMessage, runtimeReducer, truncateFrom } from "./reducer";
import {
  createConversationRecord,
  deriveTitle,
  readMessages,
  updateConversationRecord,
  upsertConversation,
  writeMessages,
} from "./store";
import {
  type ConversationRecord,
  isActivePhase,
  type RuntimeAction,
  type RuntimeErrorInfo,
  type RuntimeMessage,
  type RuntimeState,
  type ToolExecutor,
  toDisplayToolCall,
} from "./types";

/**
 * 会话运行时控制器（框架无关）。
 *
 * 它把「一次发消息」拆成一条**可回放的状态机**：
 *   send → 落用户消息 + 助手占位 → POST /chat/completions (SSE)
 *        → 增量进 reducer（正文 / 推理 / 工具调用）
 *        → 有 tool_calls 且配了 toolExecutor 时执行工具、把结果回灌再问一轮
 *        → done / error / aborted
 *
 * 三个刻意的设计决定：
 *   1. **模块级单例注册表**：同一个会话 id 在任意组件/任意非 React 代码里拿到的是同一个实例，
 *      所以 `useSyncExternalStore` 不需要 Provider，路由切换也不会丢流。
 *   2. **配置在每次发送时读**：设置页改完 Base URL / 模型，下一条消息立即生效，不用刷新。
 *   3. **草稿会话会在首次发送时「认领」一个真实 id**并 rekey 注册表：
 *      首页 /new 发第一条消息 → 自动建会话 → 侧栏立刻能看到；
 *      cx-shell 只要监听 onConversationCreated 去 navigate 即可（不做也不会丢消息）。
 */

/** 首页还没定会话时用的注册表 key */
export const DRAFT_CONVERSATION_KEY = "__draft__";

/** 工具回环上限（未实测：官方没有这个概念，取 4 轮，防止模型互相调用无穷尽） */
const DEFAULT_MAX_TOOL_ROUNDS = 4;

/** 流式过程中写 localStorage 的最小间隔（未实测：纯性能取舍） */
const PERSIST_THROTTLE_MS = 300;

export interface ConversationRuntimeOptions {
  /** 配置来源；默认读 @/api/config 的当前值 */
  config?: ResolvedApiConfig | (() => ResolvedApiConfig);
  /** 注入客户端（自测/接别的传输层用） */
  client?: ApiClient;
  /** 工具执行器；不配就不会真的执行工具（工具调用停在 pending） */
  toolExecutor?: ToolExecutor;
  maxToolRounds?: number;
  /** 是否落 localStorage，默认 true */
  persist?: boolean;
  /** 首次创建时用来垫底的初始消息（例如 @/lib 的样例会话），持久化数据优先 */
  initialMessages?: Message[];
  /** 草稿会话被赋予真实 id 时回调（用于 navigate 到 /c/:id） */
  onConversationCreated?: (conversationId: string) => void;
  now?: () => number;
  createId?: (prefix: string) => string;
}

export interface ConversationRuntime {
  readonly key: string;
  getState(): RuntimeState;
  subscribe(listener: () => void): () => void;
  /** 发一条消息（生成中调用会被忽略） */
  send(text: string): void;
  /** 用户点了停止：中断当前流，保留已生成内容 */
  stop(): void;
  /** 重试：传助手消息 id = 重新生成；传用户消息 id = 从这条重发 */
  retry(messageId?: string): void;
  /** 重新生成最后一条（或指定）助手回复 */
  regenerate(messageId?: string): void;
  /** 改掉某条用户消息并从这里重新生成 */
  editAndResend(messageId: string, text: string): void;
  clear(): void;
  dispose(): void;
  /** 程序化接口（自测与脚本用；UI 用上面那几个即可） */
  sendAsync(text: string): Promise<void>;
  retryAsync(messageId?: string): Promise<void>;
  regenerateAsync(messageId?: string): Promise<void>;
  editAndResendAsync(messageId: string, text: string): Promise<void>;
}

function defaultCreateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 「用户点了停止」的 RuntimeErrorInfo。
 *
 * 为什么不能只靠 client 抛异常：停止可能发生在**流已经收完、工具还在跑**的那一段，
 * 那条路上没有任何 fetch 会抛 AbortError —— 但状态机同样必须以 aborted 收尾（见 generate）。
 * 这里刻意绕 @/api/errors 的同一个分类入口，文案（「已停止生成。」）不在两处各写一遍。
 */
function abortedInfo(): RuntimeErrorInfo {
  return toRuntimeError(new DOMException("已停止生成。", "AbortError"));
}

function toRuntimeError(error: unknown): RuntimeErrorInfo {
  const apiError = toApiError(error);
  return {
    kind: apiError.kind,
    message: apiError.message,
    status: apiError.status,
    detail: apiError.detail,
    retryable: apiError.retryable,
  };
}

/** 展示用消息（含工具调用）→ 发回服务端的消息（snake_case 由 client 负责） */
function toApiHistory(messages: RuntimeMessage[]): ChatMessageParam[] {
  const out: ChatMessageParam[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.error) continue; // 出错那条不回灌给模型
    const param: ChatMessageParam = { role: "assistant", content: message.content };
    if (message.toolCalls && message.toolCalls.length > 0) {
      param.toolCalls = message.toolCalls.map((call, index) => ({
        index,
        id: call.id,
        name: call.name,
        arguments: call.input ?? "",
      }));
    }
    if (!param.content && !param.toolCalls) continue;
    out.push(param);
  }
  return out;
}

/** 增量事件的累积器：把 SSE 的 tool_delta 拼成完整调用（按 index） */
function createToolCallTracker() {
  const calls = new Map<number, ChatToolCall>();
  return {
    ensure(index: number, id: string, name: string): ChatToolCall {
      let call = calls.get(index);
      if (!call) {
        call = { index, id: id || `call_${index}`, name: name || "", arguments: "" };
        calls.set(index, call);
      } else {
        if (id) call.id = id;
        if (name) call.name = name;
      }
      return call;
    },
    list(): ChatToolCall[] {
      return [...calls.values()].sort((a, b) => a.index - b.index);
    },
  };
}

const registry = new Map<string, ConversationRuntime>();

export function createConversationRuntime(
  key: string,
  options: ConversationRuntimeOptions = {},
): ConversationRuntime {
  let runtimeKey = key;
  const isDraft = key === DRAFT_CONVERSATION_KEY;

  const now = options.now ?? (() => Date.now());
  const nextId = options.createId ?? defaultCreateId;
  const persistEnabled = options.persist !== false;
  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  const listeners = new Set<() => void>();
  let state: RuntimeState = createIdleState(isDraft ? null : key);
  let controller: AbortController | null = null;
  let lastPersistAt = 0;
  let disposed = false;

  // ── 初始化：先读持久化，读不到再用调用方给的样例消息垫底 ──
  {
    const stored = persistEnabled ? readMessages(isDraft ? null : key) : [];
    const seed: RuntimeMessage[] =
      stored.length > 0
        ? stored
        : (options.initialMessages ?? []).map((message) => ({ ...message, conversationId: key }));
    if (seed.length > 0) {
      state = runtimeReducer(state, {
        type: "hydrate",
        conversationId: state.conversationId,
        messages: seed,
      });
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function persist(force: boolean) {
    if (!persistEnabled || disposed) return;
    const stamp = now();
    if (!force && stamp - lastPersistAt < PERSIST_THROTTLE_MS) return;
    lastPersistAt = stamp;
    writeMessages(state.conversationId, state.messages);
    if (state.conversationId) {
      const firstUser = state.messages.find((message) => message.role === "user");
      const updatedAt = new Date(state.updatedAt || stamp).toISOString();
      const updated = updateConversationRecord(state.conversationId, {
        title: firstUser ? deriveTitle(firstUser.content) : undefined,
        updatedAt,
        messageCount: state.messages.length,
      });
      // 显式 id 起的运行时（例如直接从 /c/:id 进来）还没索引记录：第一次真实写入时补一条，
      // 这样侧栏一定能看见这条会话；只浏览不发言时不会污染列表。
      if (!updated) {
        const created = createConversationRecord({
          id: state.conversationId,
          title: firstUser ? firstUser.content : undefined,
          at: updatedAt,
        });
        upsertConversation({ ...created, messageCount: state.messages.length });
      }
    }
  }

  function apply(action: RuntimeAction, after: "none" | "throttle" | "force" = "throttle") {
    const next = runtimeReducer(state, action);
    if (next === state) return;
    state = next;
    emit();
    if (after === "force") persist(true);
    else if (after === "throttle") persist(false);
  }

  /** 把配置读成一份确定的快照（每次发送都重新读，设置页改完立即生效） */
  function readConfig(): ResolvedApiConfig {
    const source = options.config;
    if (typeof source === "function") return normalizeApiConfig(source());
    if (source) return normalizeApiConfig(source);
    return getApiConfig();
  }

  function makeMessage(
    role: RuntimeMessage["role"],
    content: string,
    atMs: number,
    extra: Partial<RuntimeMessage> = {},
  ): RuntimeMessage {
    return {
      id: nextId(role),
      conversationId: state.conversationId ?? key,
      role,
      content,
      createdAt: new Date(atMs).toISOString(),
      ...extra,
    };
  }

  /** 草稿会话：第一次发送时落一个真实会话，并把注册表 rekey 到新 id */
  function ensureConversation(title: string): string {
    if (state.conversationId) return state.conversationId;
    const id = nextId("conv");
    const record: ConversationRecord = createConversationRecord({ id, title: deriveTitle(title) });
    upsertConversation({ ...record, messageCount: state.messages.length });
    const previousKey = runtimeKey;
    runtimeKey = id;
    registry.delete(previousKey);
    registry.set(id, self);
    state = { ...state, conversationId: id };
    emit();
    options.onConversationCreated?.(id);
    return id;
  }

  /** 单轮流式：返回本轮结果；错误/中断直接写进状态并返回 ok:false */
  async function streamOnce(
    client: ApiClient,
    apiMessages: ChatMessageParam[],
    messageId: string,
    abort: AbortController,
  ): Promise<{ ok: boolean; content: string; toolCalls: ChatToolCall[] }> {
    const tracker = createToolCallTracker();
    let sawDelta = false;
    let sawReasoning = false;
    let reasoningClosed = false;

    /**
     * 推理段落幕：第一个正文 / 工具调用增量到达时把 reasoningComplete 置上（见 RuntimeMessage 的注释）。
     * 只置一次，且只在真的收到过推理增量时才置 —— 免得给没有推理的消息挂一个无意义的标记。
     */
    const closeReasoning = () => {
      if (!sawReasoning || reasoningClosed) return;
      reasoningClosed = true;
      apply({ type: "message/patch", id: messageId, patch: { reasoningComplete: true } }, "none");
    };

    const onEvent = (event: ChatStreamEvent) => {
      switch (event.type) {
        case "open":
          apply({ type: "phase", phase: "streaming", activeMessageId: messageId }, "none");
          break;
        case "content":
          sawDelta = true;
          closeReasoning();
          apply({ type: "delta", id: messageId, content: event.delta }, "throttle");
          break;
        case "reasoning":
          sawDelta = true;
          sawReasoning = true;
          apply({ type: "delta", id: messageId, reasoning: event.delta }, "throttle");
          break;
        case "tool_start": {
          closeReasoning();
          const call = tracker.ensure(event.index, event.id, event.name);
          apply({ type: "tool/upsert", id: messageId, call: toDisplayToolCall(call, "running") }, "throttle");
          break;
        }
        case "tool_delta": {
          closeReasoning();
          const call = tracker.ensure(event.index, event.id ?? "", event.name ?? "");
          call.arguments += event.argumentsDelta;
          apply({ type: "tool/upsert", id: messageId, call: toDisplayToolCall(call, "running") }, "throttle");
          break;
        }
        case "tool_done": {
          apply(
            { type: "tool/upsert", id: messageId, call: toDisplayToolCall(event.call, "pending") },
            "throttle",
          );
          break;
        }
        case "usage":
          apply({ type: "message/patch", id: messageId, patch: { usage: event.usage } }, "none");
          break;
        default:
          break;
      }
    };

    apply({ type: "phase", phase: "sending", activeMessageId: messageId }, "force");
    try {
      const result = await client.streamChat({ messages: apiMessages, signal: abort.signal, onEvent });
      if (!sawDelta) {
        // 一次事件都没来（例如服务端只有 finish）：也要把最终内容补齐
        apply(
          {
            type: "message/patch",
            id: messageId,
            patch: { content: result.content, reasoning: result.reasoning },
          },
          "none",
        );
      }
      apply(
        {
          type: "turn/finish",
          id: messageId,
          phase: "done",
          finishReason: result.finishReason,
          usage: (result.usage ?? null) as TokenUsage | null,
          at: now(),
        },
        "force",
      );
      return { ok: true, content: result.content, toolCalls: result.toolCalls };
    } catch (error) {
      apply({ type: "turn/error", id: messageId, error: toRuntimeError(error) }, "force");
      return { ok: false, content: "", toolCalls: [] };
    }
  }

  /** 一轮生成 + 工具回环 */
  async function generate(history: RuntimeMessage[], firstAssistantId: string): Promise<void> {
    const client = options.client ?? createApiClient(readConfig());
    const abort = new AbortController();
    controller = abort;
    const apiMessages = toApiHistory(history);
    let messageId = firstAssistantId;
    let round = 0;

    try {
      for (;;) {
        // 中断收尾（一）：上一轮工具执行/回灌期间用户点了停止。
        // 这里**不能裸 return** —— 那条助手消息会永远停在 streaming:true、phase 停在 streaming，
        // Composer 的停止键再也不复位（实测复现见 selftest「工具执行中停止」）。
        if (abort.signal.aborted) {
          apply({ type: "turn/error", id: messageId, error: abortedInfo() }, "force");
          return;
        }
        const outcome = await streamOnce(client, apiMessages, messageId, abort);
        if (!outcome.ok) return;
        const calls = outcome.toolCalls;
        if (calls.length === 0) return;

        const executor = options.toolExecutor;
        if (!executor) {
          // 没有执行器：调用留在 pending（UI 会显示成「待执行」），本轮到此结束
          return;
        }
        if (round >= maxToolRounds) {
          apply({ type: "message/append", message: makeMessage("system", "", now()) }, "none");
          return;
        }

        round += 1;
        apply({ type: "round", round }, "none");
        apply({ type: "phase", phase: "tool_call", activeMessageId: messageId }, "force");

        // 先把「带 tool_calls 的 assistant 消息」放进 API 历史，再放工具结果（顺序不能反）
        const assistantParam: ChatMessageParam = { role: "assistant", content: outcome.content };
        assistantParam.toolCalls = calls;
        apiMessages.push(assistantParam);

        for (const call of calls) {
          apply(
            {
              type: "tool/upsert",
              id: messageId,
              call: { ...toDisplayToolCall(call, "running"), output: undefined },
            },
            "force",
          );
          let output = "";
          let status: "success" | "error" = "success";
          try {
            output = await executor({ id: call.id, name: call.name, arguments: call.arguments });
          } catch (error) {
            status = "error";
            output = error instanceof Error ? error.message : String(error);
          }
          apply(
            { type: "tool/upsert", id: messageId, call: { ...toDisplayToolCall(call, status), output } },
            "force",
          );
          apiMessages.push({ role: "tool", content: output, toolCallId: call.id });
        }

        apply({ type: "phase", phase: "tool_result", activeMessageId: messageId }, "force");

        // 中断收尾（二）：工具执行是 await 的，用户完全可能在这一段点停止。
        // 先收尾再判断，绝不建下一条助手消息 —— 否则会多出一条永远空白的 streaming 消息。
        if (abort.signal.aborted) {
          apply({ type: "turn/error", id: messageId, error: abortedInfo() }, "force");
          return;
        }

        const next = makeMessage("assistant", "", now(), { streaming: true });
        apply({ type: "message/append", message: next }, "force");
        messageId = next.id;
        apply({ type: "phase", phase: "streaming", activeMessageId: messageId }, "none");
      }
    } finally {
      if (controller === abort) controller = null;
    }
  }

  /** 追加一条助手占位消息并开跑（重新生成 / 编辑重发共用） */
  async function startTurn(history: RuntimeMessage[]): Promise<void> {
    const assistant = makeMessage("assistant", "", now(), { streaming: true });
    apply({ type: "message/append", message: assistant }, "none");
    apply({ type: "phase", phase: "sending", activeMessageId: assistant.id }, "force");
    await generate(history, assistant.id);
  }

  async function sendAsync(text: string): Promise<void> {
    const content = text.trim();
    if (!content || isActivePhase(state.phase)) return;
    const at = now();
    const conversationId = ensureConversation(content);
    const user: RuntimeMessage = {
      id: nextId("user"),
      conversationId,
      role: "user",
      content,
      createdAt: new Date(at).toISOString(),
    };
    const assistant = makeMessage("assistant", "", at, { streaming: true });
    const history = [...state.messages, user];
    apply({ type: "turn/start", user, assistant, at }, "force");
    await generate(history, assistant.id);
  }

  async function regenerateAsync(targetId?: string): Promise<void> {
    if (isActivePhase(state.phase)) return;
    const messages = state.messages;
    const target = targetId
      ? messages.find((message) => message.id === targetId)
      : [...messages].reverse().find((message) => message.role === "assistant");
    if (!target) return;
    if (target.role === "user") {
      const history = truncateFrom(messages, target.id);
      apply(
        { type: "hydrate", conversationId: state.conversationId, messages: history, updatedAt: now() },
        "force",
      );
      await sendAsync(target.content);
      return;
    }
    const owner = findPreviousUserMessage(messages, target.id);
    if (!owner) return;
    const history = truncateFrom(messages, target.id);
    apply(
      { type: "hydrate", conversationId: state.conversationId, messages: history, updatedAt: now() },
      "force",
    );
    await startTurn(history);
  }

  async function editAndResendAsync(messageId: string, text: string): Promise<void> {
    if (isActivePhase(state.phase)) return;
    const content = text.trim();
    if (!content) return;
    const target = state.messages.find((message) => message.id === messageId && message.role === "user");
    if (!target) return;
    const history = truncateFrom(state.messages, target.id).concat({
      ...target,
      content,
      editedFrom: target.content,
    });
    apply(
      { type: "hydrate", conversationId: state.conversationId, messages: history, updatedAt: now() },
      "force",
    );
    await startTurn(history);
  }

  const self: ConversationRuntime = {
    get key() {
      return runtimeKey;
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(text) {
      void sendAsync(text);
    },
    stop() {
      controller?.abort();
    },
    retry(messageId) {
      void regenerateAsync(messageId);
    },
    regenerate(messageId) {
      void regenerateAsync(messageId);
    },
    editAndResend(messageId, text) {
      void editAndResendAsync(messageId, text);
    },
    clear() {
      apply({ type: "clear", at: now() }, "force");
    },
    dispose() {
      disposed = true;
      controller?.abort();
      listeners.clear();
      registry.delete(runtimeKey);
    },
    sendAsync,
    retryAsync: regenerateAsync,
    regenerateAsync,
    editAndResendAsync,
  };

  return self;
}

/** 取（或创建）某个会话的运行时。同一个 id 永远返回同一个实例 */
export function getConversationRuntime(
  conversationId: string | undefined,
  options: ConversationRuntimeOptions = {},
): ConversationRuntime {
  const key = conversationId && conversationId.length > 0 ? conversationId : DRAFT_CONVERSATION_KEY;
  const existing = registry.get(key);
  if (existing) return existing;
  const runtime = createConversationRuntime(key, options);
  if (!registry.has(runtime.key)) registry.set(runtime.key, runtime);
  return runtime;
}

export function disposeConversationRuntime(conversationId: string | undefined): void {
  const key = conversationId && conversationId.length > 0 ? conversationId : DRAFT_CONVERSATION_KEY;
  registry.get(key)?.dispose();
}
