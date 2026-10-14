/**
 * 对话面（chat）—— 首页态与会话态。
 *
 * 对外暴露与 @/shell/routes.tsx 的接线契约（lead 收到后把 routes.tsx 的占位换成本模块）：
 *   ChatRoute          → 首页态 /new
 *   ConversationRoute  → 会话态 /c/:conversationId
 * 另外导出 WorkspaceHeader（工作区标题栏）与 Composer，供设置页等复用。
 */

export { WorkspaceHeader } from "@/shell/WorkspaceHeader";
export { ArtifactPanel } from "./ArtifactPanel";
export { ConversationRoute } from "./ChatConversation";
export { ChatRoute } from "./ChatHome";
export { CodeBlock } from "./CodeBlock";
export { Composer, type ComposerSelection } from "./Composer";
export { ConversationView, type ConversationViewProps } from "./ConversationView";
export { Markdown } from "./Markdown";
export { Message } from "./Message";
export { ChatSkeleton } from "./Skeleton";
export { type ChatStatus, useChatSession, useComposerSelection } from "./use-chat";
export { useFollowUp } from "./use-follow-up";
export { useTurnNotifications } from "./use-turn-notifications";
