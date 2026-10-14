import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { CodexEllipsis, CodexNewTab, CodexRows } from "@/icons";
import { findConversation, listMessages } from "@/lib/conversations";
import { desktop } from "@/shell/desktop-bridge";
import { ArtifactPanel } from "./ArtifactPanel";
import { ConversationView } from "./ConversationView";
// 会话页与首页共用同一个模块级运行时单例：从首页发出第一条 -> 这里已经有流在跑，
// 路由切换不会断流、不丢字（见 src/chat/runtime/README.md）。
import { deriveTitle, useConversationRuntime, useRuntimeConversations } from "./runtime";
import { useFollowUp } from "./use-follow-up";

/**
 * 会话态（/c/:conversationId）。
 *
 * 结构、几何与交互全部在 ConversationView（官方 blocks-conversation.json 复刻的那套骨架）；
 * 本文件只负责「原生运行时数据源 + 产物面板」的接线。
 * ARTEX 任务会话页用同一个骨架，只是换成 ARTEX 活动流作为数据源（见 artex/codex-adapter.tsx）。
 */
export function ConversationRoute() {
  const { conversationId } = useParams();
  const conversation = findConversation(conversationId);
  /**
   * 样例会话的初始消息。
   *
   * 运行时只从 localStorage 读消息；读不到就只用 `options.initialMessages` 垫底
   * （runtime.ts:192-206）。不传的话 /c/c1 会显示「这个会话还没有消息」，
   * 而参考端同一个会话有两轮消息（blocks-conversation.json 的用户气泡 / 已思考 / read_file 卡）。
   * ⚠️ 持久化优先级不变：本地发过消息的会话仍以 localStorage 为准（runtime 里 stored 优先）。
   */
  const initialMessages = useMemo(() => listMessages(conversationId), [conversationId]);
  const { messages, retry, send, status, stop } = useConversationRuntime(conversationId, {
    initialMessages,
  });
  // 「跟进方式」（设置 → 常规）：生成中再发一条 —— 排队等它说完，或引导式打断
  const followUp = useFollowUp(status, send, stop);
  // 运行时会话（我们自己发出来的）不在 @/lib 的 mock 数据源里：只查 findConversation 的话，
  // 每个真会话的 header 标题都永远是「新聊天」，侧栏「最近」里也看不到它。这里补一条运行时索引，
  // 标题规则直接用 store 的 deriveTitle，与侧栏列表同源。
  const runtimeRecord = useRuntimeConversations().find((item) => item.id === conversationId);
  // 默认关：新会话 = 官方 ref-08 那一态，不裁；用户主动点 header 的分栏钮才打开
  // （打开后与官方 blocks-conversation capture 逐值一致）。
  const [artifactOpen, setArtifactOpen] = useState(false);

  const firstUserText = messages.find((message) => message.role === "user")?.content ?? "";
  const title =
    conversation?.title ?? runtimeRecord?.title ?? (firstUserText ? deriveTitle(firstUserText) : "新聊天");
  // 会话 id 存在但数据还没到（接后端后这一段就是真的 loading 态）。
  // ⚠️ 第三个条件不能省：新建的运行时会话本来就不在 mock 数据源里，
  // 只看 conversation 会卡在骨架屏（消息已流出却不显示）。
  const isLoading = Boolean(conversationId) && !conversation && messages.length === 0;

  return (
    <ConversationView
      actions={
        /* 右侧三个控件，左→右：···（会话选项）/ 分栏（产物面板）/ ⊞（新建窗口）。
           顺序出处：Lead 逐像素比对 reference-shots/ref-08-conversation.png
           （从右到左依次是 ⊞、分栏、···）；尺寸与间距沿用 .codex-icon-button 的
           28×28 / r 12.5px / gap 6px（SPEC §3 工作区 header 右侧动作组口径）。 */
        <>
          <button aria-label="会话选项" className="codex-icon-button" type="button">
            <CodexEllipsis size={16} />
          </button>
          <button
            aria-label="打开产物面板"
            aria-pressed={artifactOpen}
            className="codex-icon-button"
            onClick={() => setArtifactOpen((open) => !open)}
            type="button"
          >
            <CodexRows size={16} />
          </button>
          <button
            aria-label="新建窗口"
            className="codex-icon-button"
            onClick={() => desktop.newWindow()}
            type="button"
          >
            <CodexNewTab size={16} />
          </button>
        </>
      }
      loading={isLoading}
      messages={messages}
      onRetry={retry}
      onSend={followUp.submit}
      onStop={stop}
      panel={artifactOpen ? <ArtifactPanel conversation={conversation} /> : null}
      steer={followUp.allowSteer}
      status={status}
      title={title}
      onQueuedEdit={followUp.edit}
      onQueuedRemove={followUp.remove}
      onQueuedSteer={followUp.steer}
      queued={followUp.queued}
    />
  );
}
