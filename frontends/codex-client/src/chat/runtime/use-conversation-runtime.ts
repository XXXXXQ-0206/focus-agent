import { useCallback, useMemo, useSyncExternalStore } from "react";

import { type ConversationRuntime, type ConversationRuntimeOptions, getConversationRuntime } from "./runtime";
import { listConversations, subscribeConversations } from "./store";
import type { ConversationRecord, RuntimeErrorInfo, RuntimeMessage, TurnPhase } from "./types";
import { statusOf } from "./types";

/**
 * 把会话运行时接到 React 上。
 *
 * 这是 cx-shell 唯一需要改的一行：
 *   const { messages, status, send, stop, retry } = useConversationRuntime(conversationId);
 * 返回值与原来的 `useChatSession` **同名同形**（messages / status / send / stop / retry），
 * 所以 Composer 与 Message 组件一行都不用改；多出来的字段按需取用。
 *
 * 不依赖 Provider：运行时是模块级单例（见 runtime.ts），
 * 路由切走再回来仍是同一条流，不会重连或丢字。
 */

export interface ConversationRuntimeApi {
  /** 草稿态（首页 /new，还没发第一条消息）为 null；发送后自动变成真实会话 id */
  conversationId: string | null;
  messages: RuntimeMessage[];
  /** 与 Composer 的 ChatStatus 完全一致：只有 idle / streaming */
  status: "idle" | "streaming";
  /** 更细的轮次阶段：sending / streaming / tool_call / tool_result / done / error / aborted */
  phase: TurnPhase;
  isBusy: boolean;
  /** 最近一次非中断错误（中断不算错误） */
  error: RuntimeErrorInfo | null;
  send: (text: string) => void;
  stop: () => void;
  retry: (messageId?: string) => void;
  regenerate: (messageId?: string) => void;
  editAndResend: (messageId: string, text: string) => void;
  clear: () => void;
  /** 逃生口：需要订阅非 React 状态或调 sendAsync 时用 */
  runtime: ConversationRuntime;
}

/**
 * options 只在「该 conversationId 第一次出现」时生效（例如 initialMessages / toolExecutor /
 * onConversationCreated）。后续渲染传入的新对象不会重建运行时 —— 这是刻意的：
 * 运行时持有正在进行的流，任何重建都会把流打断。
 */
export function useConversationRuntime(
  conversationId?: string,
  options: ConversationRuntimeOptions = {},
): ConversationRuntimeApi {
  // biome-ignore lint/correctness/useExhaustiveDependencies: options 只在「建实例」时用一次；把它放进依赖会在每次渲染重建运行时，直接打断正在进行的流
  const handle = useMemo(() => getConversationRuntime(conversationId, options), [conversationId]);
  const state = useSyncExternalStore(handle.subscribe, handle.getState, handle.getState);

  const send = useCallback((text: string) => handle.send(text), [handle]);
  const stop = useCallback(() => handle.stop(), [handle]);
  const retry = useCallback((messageId?: string) => handle.retry(messageId), [handle]);
  const regenerate = useCallback((messageId?: string) => handle.regenerate(messageId), [handle]);
  const editAndResend = useCallback(
    (messageId: string, text: string) => handle.editAndResend(messageId, text),
    [handle],
  );
  const clear = useCallback(() => handle.clear(), [handle]);

  return {
    conversationId: state.conversationId,
    messages: state.messages,
    status: statusOf(state.phase),
    phase: state.phase,
    isBusy: statusOf(state.phase) === "streaming",
    error: state.error,
    send,
    stop,
    retry,
    regenerate,
    editAndResend,
    clear,
    runtime: handle,
  };
}

/**
 * 侧栏用的会话列表：只列「真跑过对话」的会话（localStorage 里的），按更新时间倒序。
 * @/lib 的 mock 会话仍在 `useConversations()` 里，两者可以合并展示（由 cx-shell 决定）。
 */
export function useRuntimeConversations(): ConversationRecord[] {
  return useSyncExternalStore(subscribeConversations, listConversations, listConversations);
}
