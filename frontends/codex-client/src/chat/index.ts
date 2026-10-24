/**
 * 对话面（chat）—— 会话渲染骨架与组件。
 *
 * ★ 2026-10-16 清理：本目录早期自带一套「本机直连模型端点」的会话运行时
 * （`runtime/` 状态机 + `ChatHome` / `ChatConversation` 两个页面），它没有挂到任何路由 ——
 * App.tsx 的 `/new` 与 `/c/:conversationId` 都走 `@/artex/codex-adapter` 的 Focus 桥接页。
 * 那套运行时连同它依赖的 `@/api/**` 直连客户端一起删掉了；这里只剩下**两侧共用**的东西：
 * 会话骨架（ConversationView）、消息渲染（Message / Markdown / CodeBlock）、
 * 输入区（Composer）与它用到的几个 hook，以及消息模型本身（./types）。
 */

export { WorkspaceHeader } from "@/shell/WorkspaceHeader";
export { ArtifactPanel } from "./ArtifactPanel";
export { CodeBlock } from "./CodeBlock";
export { Composer, type ComposerAttachment, type ComposerSelection } from "./Composer";
export { ConversationView, type ConversationViewProps } from "./ConversationView";
export { Markdown } from "./Markdown";
export { Message } from "./Message";
export { ChatSkeleton } from "./Skeleton";
export {
  ACTIVE_PHASES,
  isActivePhase,
  type RuntimeErrorInfo,
  type RuntimeMessage,
  statusOf,
  summarizeArguments,
  type TurnPhase,
  toDisplayErrorNode,
  toDisplayToolCall,
} from "./types";
export { type ChatStatus, useChatSession, useComposerSelection } from "./use-chat";
export { useFollowUp } from "./use-follow-up";
export { useTurnNotifications } from "./use-turn-notifications";
