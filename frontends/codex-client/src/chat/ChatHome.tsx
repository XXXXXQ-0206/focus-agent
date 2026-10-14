import { useNavigate } from "react-router-dom";

import { CodexHomeHero, CodexNewTab, CodexProjectPicker } from "@/icons";
import { PROJECTS } from "@/lib/mock-data";
import { WorkspaceHeader } from "@/shell/WorkspaceHeader";
import { Composer } from "./Composer";
// ⚠️ 用**真实会话运行时**（@/chat/runtime），不是旧的 use-chat。
// 旧 hook 的 send 只改内存状态、不建会话也不跳路由，于是「在首页发一条消息」什么都看不到
// —— 行为测试 kb.composer.send-leaves-trace 抓到的就是这个（消息节点 0、路由仍是 /new）。
// 运行时的 onConversationCreated 会在首条消息发出时建出真实会话 id，我们据此进入会话页。
import { useConversationRuntime } from "./runtime";
import { useComposerSelection } from "./use-chat";
import { useFollowUp } from "./use-follow-up";
import { QueuedMessageBar } from "./QueuedMessageBar";
import "./chat.css";

/**
 * 首页态（/new）。
 *
 * 实测（captures/blocks-chat-home.json，@1280×816）：
 *   模式切换条   [341,96 935×**46**]（h-toolbar）—— 实测该条**无可见子元素**，按空条实现
 *   首页布局     [351,142 915×670]  padding **`24px 0 0`**
 *   主区（标题） [351,166 915×**371**]  `items-end justify-center` + padding-bottom **96px**
 *     标题列     [424,327 **768**×114]  padding **`0 20px`**（内容 728 宽）
 *     空态图标   [780,327 **56×56**]  opacity **.3**（size-14）
 *     标题       [696,407 224×**33.6**]  **28px / 33.6px / weight 400** 居中（--text-heading-app）
 *     图标到标题 gap = 407.4 − 383.4 = **24px**
 *   输入区列     [424,644 **768×152**]  padding `0 16px`  gap 8px
 *     「选择项目」条 [453,660 710×62]  padding-bottom 20  margin **`0 13px −24px`**
 *                     r **`20px 20px 0 0`**  底色实测 **rgb(40,40,40)**（--color-surface-tertiary）
 *                     行 [457,660 702×38] padding `5px 0`；芯片 [457,665 **91×28**] r 9999px
 *                     padding `0 8px` gap 6px 字体 **13px/18px/430** 色 rgba(255,255,255,.498)
 *   输入面板     [440,698 **736×98**]（见 Composer.tsx）
 *
 * ⚠️ 组合器区域高度 **275px**：官方由 flex 分配算法得出（标题区 basis 0 grow 1 = 371、
 *    组合器区 = 275），这里按下限钉住以保证几何可复现，见 chat.css 的 --cx-home-composer-area。
 */
export function ChatRoute() {
  const navigate = useNavigate();
  const { send, status, stop } = useConversationRuntime(undefined, {
    // 首页是「草稿会话」：第一条消息发出后运行时才会建出真实 id，此时进入会话页
    onConversationCreated: (id: string) => navigate(`/c/${id}`),
  });
  const selection = useComposerSelection();
  // 「跟进方式」（设置 → 常规）：生成中再发一条 —— 排队 / 引导
  const followUp = useFollowUp(status, send, stop);

  const title = selection.project
    ? `你想让我们在 ${selection.project.name} 中构建什么？`
    : "我们要构建什么？";

  return (
    <>
      <WorkspaceHeader
        actions={
          <button aria-label="新建标签页" className="codex-icon-button" type="button">
            <CodexNewTab size={16} />
          </button>
        }
      />
      <div className="cx-home">
        <div aria-hidden className="cx-home__mode-bar" />
        {/*
          官方 home-main-content（size 容器）：app-primary-2b28b2369958.js byte 3163186
            ld(`[container-type:size] relative flex min-h-0 w-full flex-1 flex-col
                [container-name:home-main-content]`, "overflow-y-auto has-[[data-expanded-composer]]:overflow-y-hidden", …)
          实测 captures/blocks-chat-home.json block[36] [340.667,142 935.333×670]，
          是下面 group/home-composer-layout 那层（block[37] [350.667,142 915.333×670]）的**直接父节点**。
          #50 展开态要它来解析 100cqh（670 ⇒ 展开高度 min(642,606,768)=606；挂在 .cx-home 上会
          把 46px 的 mode-bar 也算进去 → 716 ⇒ 642，与官方不符）。详见 chat.css 的 .cx-home__main。
        */}
        <div className="cx-home__main">
          {/* 官方 group/home-composer-layout（Tailwind 组主）：group-has-[[data-expanded-composer]]/home-composer-layout
              的三条规则（:hidden 藏 hero、:flex-none 组合器区、组主 :justify-center）都挂在它身上。 */}
          <div className="cx-home__layout">
            <div className="cx-home__stage">
              <div className="cx-home__column">
                <div aria-hidden className="cx-home__hero">
                  <CodexHomeHero size={56} />
                </div>
                <h1 className="cx-home__title">{title}</h1>
              </div>
            </div>

            <div className="cx-home__composer-area">
              <div className="cx-composer-column">
                <div className="cx-composer-column__spacer" />
                <div className="cx-project-rail">
                  <div className="cx-project-rail__row">
                    <button
                      aria-label="选择项目"
                      className="cx-chip cx-project-rail__chip"
                      onClick={() => selection.setProjectId(selection.project ? undefined : PROJECTS[0]?.id)}
                      type="button"
                    >
                      <CodexProjectPicker size={16} />
                      <span className="cx-chip__value">
                        {selection.project ? selection.project.name : "选择项目"}
                      </span>
                    </button>
                  </div>
                </div>
                {/* 排队中的消息（官方截图那条「插入对话」行）：首页态也可能在生成中追加消息 */}
                {followUp.queued.map((item) => (
                  <QueuedMessageBar
                    item={item}
                    key={item.id}
                    onEdit={followUp.edit}
                    onRemove={followUp.remove}
                    onSteer={followUp.steer}
                  />
                ))}
                <Composer
                  autoFocus
                  onSend={followUp.submit}
                  onStop={stop}
                  selection={selection}
                  status={status}
                  steer={followUp.allowSteer}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
