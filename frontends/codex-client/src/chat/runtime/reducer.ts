import type { ToolCall } from "@/lib/types";
import {
  ACTIVE_PHASES,
  type RuntimeAction,
  type RuntimeMessage,
  type RuntimeState,
  type TurnPhase,
} from "./types";

/**
 * 会话运行时的**纯函数状态机**。
 * 所有状态变化都经过这里，所以「一轮对话到底怎么走」是可单测、可回放的：
 *
 *   idle
 *     └─(send)→ turn/start → sending
 *                            └─(首个事件)→ phase:streaming
 *                                            └─(delta)→ delta（正文/推理分别追加）
 *                                            └─(tool_calls)→ tool/upsert（status: running）
 *                                            └─(finish_reason)→ turn/finish → done
 *                                            └─(异常)→ turn/error → error
 *                                            └─(用户停止)→ turn/error{kind:aborted} → aborted
 *   工具回环：done 之前若还有 toolCalls 且配了 toolExecutor，
 *            由 runtime 发起下一轮（每轮一条新的助手消息）—— reducer 只负责收状态。
 */

export const IDLE_STATE: RuntimeState = {
  conversationId: null,
  messages: [],
  phase: "idle",
  error: null,
  activeMessageId: null,
  round: 0,
  updatedAt: 0,
};

export function createIdleState(conversationId: string | null): RuntimeState {
  return { ...IDLE_STATE, conversationId };
}

function patchMessage(state: RuntimeState, id: string, patch: Partial<RuntimeMessage>): RuntimeState {
  let changed = false;
  const messages = state.messages.map((message) => {
    if (message.id !== id) return message;
    changed = true;
    return { ...message, ...patch };
  });
  return changed ? { ...state, messages } : state;
}

/** 同一 index 的工具调用要「按 index 合并」，不能重复 push（增量参数要拼在原来那条上） */
function upsertToolCall(state: RuntimeState, messageId: string, call: ToolCall): RuntimeState {
  return {
    ...state,
    messages: state.messages.map((message) => {
      if (message.id !== messageId) return message;
      const list = message.toolCalls ?? [];
      const index = list.findIndex((item) => item.id === call.id);
      const next =
        index === -1 ? [...list, call] : list.map((item, i) => (i === index ? { ...item, ...call } : item));
      return { ...message, toolCalls: next };
    }),
  };
}

export function runtimeReducer(state: RuntimeState, action: RuntimeAction): RuntimeState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        conversationId: action.conversationId,
        messages: action.messages,
        phase: "idle",
        error: null,
        activeMessageId: null,
        round: 0,
        updatedAt: action.updatedAt ?? state.updatedAt,
      };

    case "turn/start":
      return {
        ...state,
        messages: [...state.messages, action.user, action.assistant],
        phase: "sending",
        error: null,
        activeMessageId: action.assistant.id,
        round: 0,
        updatedAt: action.at,
      };

    case "message/append":
      return { ...state, messages: [...state.messages, action.message] };

    case "message/patch":
      return patchMessage(state, action.id, action.patch);

    case "delta": {
      const target = state.messages.find((message) => message.id === action.id);
      if (!target) return state;
      const content = action.content ? (target.content ?? "") + action.content : target.content;
      const reasoning = action.reasoning ? (target.reasoning ?? "") + action.reasoning : target.reasoning;
      return patchMessage(state, action.id, { content, reasoning });
    }

    case "tool/upsert":
      return upsertToolCall(state, action.id, action.call);

    case "phase": {
      if (ACTIVE_PHASES.indexOf(action.phase) === -1) return state;
      return {
        ...state,
        phase: action.phase,
        activeMessageId:
          action.activeMessageId === undefined ? state.activeMessageId : action.activeMessageId,
      };
    }

    case "turn/finish":
      return {
        ...patchMessage(state, action.id, {
          streaming: false,
          phase: action.phase,
          finishReason: action.finishReason,
          usage: action.usage,
          error: null,
        }),
        phase: action.phase,
        error: null,
        activeMessageId: null,
        updatedAt: action.at,
      };

    case "turn/error": {
      const aborted = action.error.kind === "aborted";
      // 中断不是错误：不写 error、不弹红字。
      // ⚠️ 这里**不再把错误文案回填进 content**：错误条已由 Message.tsx 用官方 ErrorBlock 渲染
      //    （RuntimeMessage.error → toDisplayErrorNode，SPEC §12），回填会变成
      //    「引用块 + 错误块」两遍同样的字。改这一条时请连着看 types.ts 的 RuntimeMessage.error。
      return {
        ...state,
        phase: aborted ? "aborted" : "error",
        error: aborted ? null : action.error,
        activeMessageId: null,
        messages: state.messages.map((message) => {
          if (message.id !== action.id) return message;
          return {
            ...message,
            streaming: false,
            phase: aborted ? "aborted" : "error",
            aborted: aborted ? true : undefined,
            error: aborted ? null : action.error,
          };
        }),
      };
    }

    // 工具回环轮数（RuntimeState.round）：runtime 每开一轮回灌就报一次，
    // 之前这个字段只有类型声明、没有任何写入点，读它的人永远拿到 0。
    case "round":
      return state.round === action.round ? state : { ...state, round: action.round };

    case "truncate": {
      const index = state.messages.findIndex((message) => message.id === action.fromId);
      if (index === -1) return state;
      return { ...state, messages: state.messages.slice(0, index), updatedAt: action.at };
    }

    case "clear":
      return { ...createIdleState(state.conversationId), updatedAt: action.at };

    default:
      return state;
  }
}

/** 该消息之后（含自己）全部丢掉 —— 重试用 */
export function truncateFrom(messages: RuntimeMessage[], fromId: string): RuntimeMessage[] {
  const index = messages.findIndex((message) => message.id === fromId);
  return index === -1 ? messages : messages.slice(0, index);
}

/** 找某条消息之前最近的一条用户消息（重新生成要用它的文本） */
export function findPreviousUserMessage(messages: RuntimeMessage[], beforeId: string): RuntimeMessage | null {
  const index = messages.findIndex((message) => message.id === beforeId);
  const scope = index === -1 ? messages : messages.slice(0, index);
  for (let i = scope.length - 1; i >= 0; i -= 1) {
    if (scope[i].role === "user") return scope[i];
  }
  return null;
}

export function phaseAfterError(error: { kind: string }): TurnPhase {
  return error.kind === "aborted" ? "aborted" : "error";
}
