/**
 * 会话运行时（chat/runtime）—— 真实的流式对话状态机。
 *
 * 与 UI 的接线契约（cx-shell 只需改这一行）：
 *   const { messages, status, send, stop, retry } = useConversationRuntime(conversationId);
 *
 * 其余可选项：
 *   · 需要首页发第一条消息后跳路由：给 options.onConversationCreated
 *   · 需要真执行工具：给 options.toolExecutor（不给自己就不执行，工具调用停在 pending）
 *   · 想让样例会话先显示内容：给 options.initialMessages（例如 @/lib 的 useMessages()）
 *   · 侧栏要列真实会话：useRuntimeConversations()
 *   · 设置页要改 API 配置：@/api 的 useApiConfig() / updateApiConfig()
 *
 * 数据落盘（localStorage）：codex.conversations / codex.messages.<会话 id>。
 * API 配置落盘在 @/api：codex.api。
 */

export {
  createIdleState,
  findPreviousUserMessage,
  IDLE_STATE,
  runtimeReducer,
  truncateFrom,
} from "./reducer";
export {
  type ConversationRuntime,
  type ConversationRuntimeOptions,
  createConversationRuntime,
  DRAFT_CONVERSATION_KEY,
  disposeConversationRuntime,
  getConversationRuntime,
} from "./runtime";
export {
  CONVERSATIONS_STORAGE_KEY,
  createConversationRecord,
  deriveTitle,
  invalidateConversationCache,
  listConversations,
  MESSAGES_STORAGE_PREFIX,
  messagesKey,
  readMessages,
  removeConversation,
  sanitizeMessagesForStorage,
  subscribeConversations,
  updateConversationRecord,
  upsertConversation,
  writeMessages,
} from "./store";
export {
  ACTIVE_PHASES,
  type ConversationRecord,
  isActivePhase,
  type RuntimeAction,
  type RuntimeErrorInfo,
  type RuntimeMessage,
  type RuntimeState,
  statusOf,
  summarizeArguments,
  type ToolExecutionRequest,
  type ToolExecutor,
  type TurnPhase,
  toDisplayErrorNode,
  toDisplayToolCall,
} from "./types";
export {
  type ConversationRuntimeApi,
  useConversationRuntime,
  useRuntimeConversations,
} from "./use-conversation-runtime";
