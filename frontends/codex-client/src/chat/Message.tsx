import type { ReactNode } from "react";

import { CodexCopy, CodexEditMessage, CodexRetry } from "@/icons";
import { messageToBlocks } from "./block-adapter";
import { ActivityGroup } from "./blocks";
import { Markdown } from "./Markdown";
// 显式收 runtime 的消息类型：它继承 @/lib/types 的 Message，多出 error / phase / aborted …
// 只认基类的话 message.error 在类型上不存在，错误条就永远接不上（见 RuntimeMessage.error 的注释）。
import { type RuntimeMessage, toDisplayErrorNode } from "./types";

/**
 * 消息（用户 / 助手）。
 *
 * 实测（captures/blocks-conversation.json）：
 *   用户行      [286,180 736×72] `flex-col items-end gap-1`（气泡↔时间戳 4px）
 *   用户气泡    [962,180 60×43] **r 22px cs SE1.5** padding `10px 16px`
 *               bg `oklab(0.903646 0 0 / 0.05)` = rgba(223,223,223,.05)  max-width 70%
 *   正文        **14px / 22.75px / weight 430**（--text-size-chat 一档）
 *   时间戳      12px/16 色 rgba(255,255,255,.498)  **默认 opacity 0**，hover / focus-within 才显
 *   动作条      两条 26×26（作者值 = 16 图标 + 4×2 padding + 1×2 border）r 10px gap 2px
 *   助手消息    **无气泡**，整列宽 markdown
 *   消息列表    gap **12px**（见 chat.css 的 .cx-messages）
 *
 * ⚠️ 推理块 / 工具调用块：SPEC §15 明确「本轮会话内容太短（只有你好），未出现这三类块」，
 *    因此它们的几何**未实测**，按 --color-surface-* / --color-border* token 层落地并标注。
 */

function ActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button aria-label={label} className="cx-message__action" onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function formatClock(iso: string) {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function Message({
  message,
  onRetry,
  showActions = true,
}: {
  /** RuntimeMessage 兼容任何 Message（多出来的字段都是可选的），所以老的调用点不用改 */
  message: RuntimeMessage;
  onRetry?: (id: string) => void;
  showActions?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="cx-message cx-message--user">
        <div className="cx-usermsg">
          <div className="cx-usermsg__bubble">
            <Markdown className="cx-usermsg__body" content={message.content} />
          </div>
        </div>
        <div className="cx-message__meta">
          <span className="cx-message__time">{formatClock(message.createdAt)}</span>
          <div className="cx-message__actions">
            <ActionButton label="复制消息">
              <CodexCopy size={16} />
            </ActionButton>
            <ActionButton label="编辑消息">
              <CodexEditMessage size={16} />
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }

  // block-adapter 手上只有轮级的 message.streaming，会把整轮的推理块都标成 running。
  // 段级信号（RuntimeMessage.reasoningComplete）在这里补上 —— 实测不加这一行时：
  // 正文已经流出 39 字，推理块仍是「思考中 + 自动展开」，要等整轮结束才跳「已思考」。
  const blocks = messageToBlocks(message).map((block) =>
    block.kind === "reasoning" && message.reasoningComplete
      ? { ...block, status: "completed" as const }
      : block,
  );
  // 错误项（SPEC §12）。**不放进 blocks 里**：块列表在正文之前渲染，而流中断时正文可能已经有
  // 半截内容，错误条压在最下面才不会把因果读反（先看到「请求失败」再看到正文）。
  const errorNode = message.error ? toDisplayErrorNode(message.error, message.id) : null;

  return (
    <div className="cx-message cx-message--assistant" data-streaming={message.streaming ? "true" : "false"}>
      {/* 推理块 / 工具调用块 —— 走 @/chat/blocks 的官方块实现（真值见 docs/SPEC-CONVERSATION-BLOCKS.md）。
          之前这里是即兴写的 .cx-reasoning / .cx-toolcall，已被替换。 */}
      {blocks.length > 0 ? <ActivityGroup blocks={blocks} spacing="item" /> : null}

      <div className="cx-message__body">
        <Markdown content={message.content} />
        {message.streaming ? <span aria-hidden className="cx-caret" /> : null}
      </div>

      {errorNode ? <ActivityGroup blocks={[errorNode]} spacing="item" /> : null}

      {showActions && !message.streaming ? (
        <div className="cx-message__meta cx-message__meta--assistant">
          <div className="cx-message__actions">
            <ActionButton label="复制回复">
              <CodexCopy size={16} />
            </ActionButton>
            <ActionButton label="重新生成" onClick={() => onRetry?.(message.id)}>
              <CodexRetry size={16} />
            </ActionButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
