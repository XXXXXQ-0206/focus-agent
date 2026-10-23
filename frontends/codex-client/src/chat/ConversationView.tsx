import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { CodexScrollToBottom } from "@/icons";
import { formatTurnDivider } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "@/shell/WorkspaceHeader";
import { isToolOnlyMessage, ToolActivityGroup } from "./ToolActivityGroup";
import { Composer, type ComposerSelection } from "./Composer";
import { Message } from "./Message";
import type { RuntimeMessage } from "./types";
import { ChatSkeleton } from "./Skeleton";
import { QueuedMessageBar } from "./QueuedMessageBar";
import { turnChangesOf } from "./turn-changes";
import type { QueuedMessage } from "./use-follow-up";
import { type ChatStatus, useComposerSelection } from "./use-chat";
import { useTurnNotifications } from "./use-turn-notifications";
import "./chat.css";

/**
 * 会话态骨架（官方 blocks-conversation.json 实测复刻）。
 *
 * 这是**唯一的会话骨架**：Focus 会话页与 Focus 任务会话页都从这里渲染 ——
 * 一个骨架、两套数据源，会话页不再各抄一份结构。
 * （2026-10-16 之前还有一套本机会话页共用它，那套运行时已删除，见 ./index.ts 头注释。）
 *
 * 实测（@1280×816）：
 *   thread-scroll-container  [·,96 935×716]  padding **`32px 0 0`**  overflow-y auto
 *   转录列                   [·,128 **768**×684]  padding **`0 16px 32px`**
 *   消息列表                 [286,128 736×136]  gap **12px**
 *   聊天标题栏               高 **52px**，右侧动作图标（28×28）
 *   输入区浮层               [**186.33**,698 **935.33**×**114**]  bg **rgb(24,24,24)**  padding-bottom **16px**
 *                            （114 = 98 输入面板 + 16；x 随 contentShift 左移 154 = 340.67−154，
 *                              实测出处 blocks-conversation block[46] 与同一段官方 JSX 的 `style: {x: contentX}`）
 *   顶部渐隐                 见 .cx-thread__fade
 *   底部渐隐                 [**196.67**,780 **915.33**×**32**]  sticky bottom-0  pointer-events none
 *   右侧浮层                 [968,104 **308×700**]（调用方通过 `panel` 传入内容时按官方 contentShift 打开）
 */

interface Turn {
  id: string;
  startedAt: string;
  messages: RuntimeMessage[];
}

/**
 * 一轮里的渲染单元：普通消息，或**连续工具活动的活动组**。
 *
 * 2026-10-20 按用户提供的参考截图恢复分组：
 *   · 运行中 → 组头「正在思考」并自动展开，逐条列出「已编辑 x +3 -2」「已在 6s 内运行 …」；
 *   · 完成后 → 组头收成「编辑了文件运行了命令」，点一下可再看明细。
 * 单条工具活动不进组（保持单行）。
 */
type RenderUnit =
  | { kind: "message"; key: string; message: RuntimeMessage }
  | { kind: "toolgroup"; key: string; messages: RuntimeMessage[] };

function toRenderUnits(messages: RuntimeMessage[]): RenderUnit[] {
  const units: RenderUnit[] = [];
  let bucket: RuntimeMessage[] = [];
  const flush = () => {
    if (bucket.length === 1) {
      units.push({ kind: "message", key: bucket[0].id, message: bucket[0] });
    } else if (bucket.length > 1) {
      units.push({ kind: "toolgroup", key: `toolgroup-${bucket[0].id}`, messages: bucket });
    }
    bucket = [];
  };
  for (const message of messages) {
    if (isToolOnlyMessage(message)) {
      bucket.push(message);
      continue;
    }
    flush();
    units.push({ kind: "message", key: message.id, message });
  }
  flush();
  return units;
}

/** 按「用户消息开启一轮」切分，用于日期分隔标题 */
function toTurns(messages: RuntimeMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const current = turns[turns.length - 1];
    if (!current || message.role === "user") {
      turns.push({ id: `turn-${message.id}`, startedAt: message.createdAt, messages: [message] });
    } else {
      current.messages.push(message);
    }
  }
  return turns;
}

export interface ConversationViewProps {
  /** 工作区标题栏标题（原生 = 会话标题；Focus = 任务标题 + 状态）。 */
  title: ReactNode;
  /** 标题栏右侧动作组（调用方决定有几颗按钮）。 */
  actions?: ReactNode;
  messages: RuntimeMessage[];
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry?: (id: string) => void;
  /** true = 数据未就绪，转录区渲染骨架屏。 */
  loading?: boolean;
  /** 无消息时的空态文案。 */
  emptyText?: string;
  /** false = 助手消息不渲染复制/重试动作（Focus 只读转录用）。 */
  showMessageActions?: boolean;
  /** 右侧浮层内容；非 null 时 `data-artifact="open"`，整层按官方 contentShift 左移 154。 */
  panel?: ReactNode | null;
  /** 转录区底部附加内容（Focus 的「原始事件」details 放这里）。 */
  contentFooter?: ReactNode;
  /** 输入区下方的附加内容（错误提示等）。 */
  composerFooter?: ReactNode;
  /** 交付主区替代内容（如 Focus 工作台视图）；为空时渲染会话转录。 */
  main?: ReactNode | null;
  /** 追加在 `.cx-conversation` 上的类名（Focus 页用它挂任务面板/工作台的专属规则）。 */
  className?: string;
  /**
   * 生成中是否允许「引导发送」（设置 → 常规 → 跟进方式 = 引导）。
   * 透传给 Composer：为 true 且输入框有文字时，发送键在生成中仍显示为发送。
   * 宿主需要把 onSend 接到 `useFollowUp().submit` 上，才能真正实现排队/引导。
   */
  steer?: boolean;
  /**
   * 排队中的消息（`useFollowUp().queued`）。
   * 非空时在输入卡上方渲染「插入对话」行（官方截图口径，见 QueuedMessageBar.tsx）。
   */
  queued?: QueuedMessage[];
  /** 三个动作透传给 QueuedMessageBar（缺省时不渲染操作按钮组也保底可用） */
  onQueuedSteer?: (id: string) => void;
  onQueuedRemove?: (id: string) => void;
  onQueuedEdit?: (id: string) => void;
  /**
   * 输入区的选择器状态。缺省 = 参考端 mock（useComposerSelection）。
   * Focus 会话页传入真实服务商/强度（见 artex/model-selection.ts）。
   */
  selection?: ComposerSelection;
}

export function ConversationView({
  title,
  actions,
  messages,
  status,
  onSend,
  onStop,
  onRetry,
  loading = false,
  emptyText = "这个会话还没有消息。在下面输入框里说点什么。",
  showMessageActions = true,
  panel = null,
  contentFooter = null,
  composerFooter = null,
  main = null,
  className,
  steer = false,
  queued = [],
  onQueuedEdit,
  onQueuedRemove,
  onQueuedSteer,
  selection: selectionProp,
}: ConversationViewProps) {
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  /**
   * 2026-10-20（用户：最下面的内容被输入框遮住、拉不上去）：
   * 输入浮层是绝对定位的兄弟层，转录区原来的下内距只有 32px，最后一条消息滚到底时正好落在
   * 输入卡后面。这里把输入卡的真实高度写成 CSS 变量，转录列据此留出等高的下内距
   * （见 chat.css 的 .cx-thread__content）。用 ResizeObserver 跟住多行输入/排队条的变化。
   */
  useEffect(() => {
    const root = rootRef.current;
    const composer = composerRef.current;
    if (!root || !composer) return;
    const sync = () => {
      root.style.setProperty("--cx-composer-height", `${Math.ceil(composer.getBoundingClientRect().height)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);
  const fallbackSelection = useComposerSelection();
  const selection = selectionProp ?? fallbackSelection;
  const turns = useMemo(() => toTurns(messages), [messages]);
  /**
   * 本轮代码改动汇总（右上角那条「N 个文件已更改 +a −d」胶囊）。
   * 只统计**最后一轮**：官方的胶囊说的是「刚刚这一轮改了什么」，
   * 会话里更早那些轮次各自在各自的转录里，不在这里重复累计。
   * 生成中不显示（一轮还没结束时数字一直在跳，官方也是轮次结束后才出现）。
   */
  const changes = useMemo(() => {
    if (loading || status === "streaming") return null;
    const lastTurn = turns[turns.length - 1];
    return lastTurn ? turnChangesOf(lastTurn.messages) : null;
  }, [loading, status, turns]);
  // 「完成与通知」（设置 → 常规）：一轮回答结束时按设置提示（声音 / 系统通知）
  useTurnNotifications(status);

  // 新消息进入 / 流式增量时贴底（只有本来就贴底才跟随，避免抢用户滚动）
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!pinnedToBottom || !lastMessage) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lastMessage, pinnedToBottom]);

  const scrollToBottom = () => {
    setPinnedToBottom(true);
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  };

  return (
    <>
      <WorkspaceHeader actions={actions} title={title} />
      <div
        className={cn("cx-conversation", className)}
        data-artifact={panel ? "open" : "closed"}
        ref={rootRef}
      >
        <div className="cx-conversation__main">
          {main ?? (
            <div
              className="cx-thread"
              onScroll={(event) => {
                const el = event.currentTarget;
                setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
                setScrolled(el.scrollTop > 0);
              }}
              ref={scrollRef}
            >
              {/* ── 转录包装层（官方 blocks-conversation.json block[14]；JS 出处
                  thread-scroll-layout-fb0c6ee4cde8.js byte 19354）────────────────────
                  官方 cls：`[container-type:inline-size] flex min-h-full shrink-0 flex-col
                  justify-start overflow-x-clip [container-name:thread-content]`，
                  rect [196.667,128 915.333×684]（面板开态；未位移时 x = 350.667）。
                  ⚠️ 底部渐隐必须挂在本层**内部**（官方 block[45] 的 path 逐字为
                    …thread-scroll-container > div.[container-type:inline-size] >
                      div.pointer-events-none.sticky.bottom-0 > div.pointer-events-none.absolute
                  ）；挂到滚动容器上时 sticky 包含块只有一屏高，一滚就跟着内容滚走。 */}
              <div className="cx-thread__content-wrap">
                <div className="cx-thread__content">
                  <div className="cx-messages">
                    {loading ? (
                      <ChatSkeleton />
                    ) : messages.length === 0 ? (
                      <p className="cx-thread__empty">{emptyText}</p>
                    ) : (
                      turns.map((turn) => {
                        const parts = formatTurnDivider(turn.startedAt).split(" ");
                        const time = parts.pop() ?? "";
                        const day = parts.join(" ");
                        return (
                          <div className="cx-turn" key={turn.id}>
                            <div className="cx-divider">
                              <time className="cx-divider__text">
                                <span className="cx-divider__day">{day}</span> {time}
                              </time>
                            </div>
                            {/* 连续工具活动收成活动组（见 toRenderUnits 注释） */}
                            {toRenderUnits(turn.messages).map((unit) =>
                              unit.kind === "toolgroup" ? (
                                <ToolActivityGroup key={unit.key} messages={unit.messages} />
                              ) : (
                                <Message
                                  key={unit.key}
                                  message={unit.message}
                                  onRetry={onRetry}
                                  showActions={showMessageActions}
                                />
                              ),
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* 「正在思考」：用户 2026-10-15 给的官方截图里，等待首字节时转录末尾就这一行灰字。
                      条件 = 会话在跑 **且最后一条是用户消息**（助手一旦有输出，行的位置就该让给它，
                      否则会出现「正文流着、下面还挂一句正在思考」的双写。 */}
                  {!loading && status === "streaming" && lastMessage?.role === "user" ? (
                    <p className="cx-thread__pending" data-testid="thread-pending" role="status">
                      正在思考
                    </p>
                  ) : null}
                  {contentFooter}
                </div>
                {/* sticky 锚 —— 官方 `div` classList 逐字为
                    `pointer-events-none sticky bottom-0 z-10 mt-auto w-full shrink-0`
                    （thread-scroll-layout-fb0c6ee4cde8.js byte 20036），children = fade。 */}
                <div className="cx-thread__end-fade-anchor">
                  {/* 底部渐隐：官方 [196.667,780 915.333×32]（block[45]）。
                      宽度 = 滚动容器内容盒（935.333 − 两侧各 10px gutter，见 .cx-thread 的
                      scrollbar-gutter: stable both-edges）；x 随 contentShift 左移 154。 */}
                  <div aria-hidden className="cx-thread__end-fade" />
                </div>
              </div>
            </div>
          )}

          <div className="cx-conversation__composer" ref={composerRef}>
            {/* 回到底部浮钮：容器 = 转录列（768，padding 0 16px），水平居中于转录列；
                纵向 bottom: calc(100% + 24px)（官方 bottom-[calc(100%+6*var(--spacing))]）。
                参考端始终在 DOM 里（opacity 0 + pointer-events-none 表示隐藏），这里同构。 */}
            <div className="cx-thread__to-bottom-anchor">
              <button
                aria-label="滚动到底部"
                className="cx-thread__to-bottom"
                data-visible={!pinnedToBottom}
                onClick={scrollToBottom}
                type="button"
              >
                <CodexScrollToBottom size={20} />
              </button>
            </div>
            <div className="cx-thread__column">
              {/* 「N 个文件已更改 +a −d」——官方截图里居中悬在输入卡上方的那枚胶囊。
                  点击 = 展开并滚到本轮最后一张文件改动卡（官方是打开 diff 面板，本工程没有那个面板）。 */}
              {changes ? (
                <div className="cx-thread__changes">
                  <button
                    className="cx-changes-pill"
                    data-testid="turn-changes"
                    onClick={() => {
                      const host = scrollRef.current;
                      if (!host) return;
                      const blocks = host.querySelectorAll("[data-local-conversation-item-target-ids]");
                      const last = blocks[blocks.length - 1] as HTMLElement | undefined;
                      if (!last) return;
                      const toggle = last.querySelector("button");
                      if (toggle instanceof HTMLElement) toggle.click();
                      last.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    title="本轮代码改动"
                    type="button"
                  >
                    <span>{changes.files} 个文件已更改</span>
                    {changes.hasLineCounts ? (
                      <>
                        <span className="cx-changes-pill__added">+{changes.added}</span>
                        <span className="cx-changes-pill__deleted">-{changes.deleted}</span>
                      </>
                    ) : null}
                  </button>
                </div>
              ) : null}
              {/* 「插入对话 / 排队」行：一条排队消息一行（官方截图那条）。 */}
              {queued.map((item) => (
                <QueuedMessageBar
                  item={item}
                  key={item.id}
                  onEdit={onQueuedEdit ?? (() => undefined)}
                  onRemove={onQueuedRemove ?? (() => undefined)}
                  onSteer={onQueuedSteer ?? (() => undefined)}
                />
              ))}
              <Composer
                mode="conversation"
                onSend={onSend}
                onStop={onStop}
                selection={selection}
                steer={steer}
                status={status}
              />
              {composerFooter}
            </div>
          </div>
        </div>

        {panel}

        {/* 顶部渐隐（#70）：官方 _MainContentTopFade_yl8z4_2 340.67,96 935.33×40
            绝对定位挂在主内容面上；opacity 0 → 1 由「是否已滚动」驱动。 */}
        <div aria-hidden className="cx-thread__fade" data-visible={scrolled} />
      </div>
    </>
  );
}
