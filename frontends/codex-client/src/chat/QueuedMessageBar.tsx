import { CodexEllipsis, CodexQueueInsert, CodexSteerReturn, CodexTrash } from "@/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

import type { QueuedMessage } from "./use-follow-up";

/**
 * 「插入对话 / 排队」那条消息（用户 2026-10-15 给的官方截图口径）。
 * ============================================================================
 * 参考截图（Focus 实机，1.5× 缩放；数值已按 1.5 换算成 CSS px）：
 *
 *   卡片   宽 = 输入卡 − 27（左右各缩 13.5，官方是「压在输入卡后面」的略小一层）
 *          高 **32**、bg **rgb(48,48,48)**（输入卡 58 的下一档）、圆角 **10**、四角都圆
 *          与输入卡之间几乎贴合（截图里两卡之间只透出 1px 页面底色）
 *   左侧图标 **16×16** 距左缘 **13**，色约 rgb(125,125,125)（≈ 白 49%）
 *   正文    13px/18px、色 **rgb(255,255,255)**、与图标间距 6、单行省略
 *   右侧动作 从右往左：`···`（16）· 垃圾桶（16）· `↵ 引导`（16 图标 + 13px 文字），
 *          色约 rgb(158,158,158)（≈ 白 62%）、彼此间距 ~8，距右缘 ~12
 *
 * 交互（与 use-follow-up 的队列一一对应）：
 *   · 引导 → steer(id)：立刻打断当前生成，并把这条提到队首；
 *   · 垃圾桶 → remove(id)：从队列删掉；
 *   · `···` → 菜单：编辑（放回输入框，edit(id)）/ 删除。
 * 图标出处：官方图标目录 `arrow-curvedpath-right-lg-light-16`（前缀）与
 * `arrow-curvedpath-left-lg-light-16`（引导的 ↵），见 src/icons/conversation.tsx。
 */
export function QueuedMessageBar({
  item,
  onEdit,
  onRemove,
  onSteer,
}: {
  item: QueuedMessage;
  /** `···` 菜单里的「编辑」：把文本放回输入框 */
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSteer: (id: string) => void;
}) {
  return (
    <div className="cx-queued" data-testid="queued-message" data-queued-id={item.id}>
      <CodexQueueInsert aria-hidden className="cx-queued__icon" size={16} />
      <span className="cx-queued__text" title={item.text}>
        {item.text}
        {item.attachments.length ? ` · 📎 ${item.attachments.length}` : ""}
      </span>
      <div className="cx-queued__actions">
        <button
          className="cx-queued__action"
          onClick={() => onSteer(item.id)}
          title="引导：打断当前回答，先发这条"
          type="button"
        >
          <CodexSteerReturn aria-hidden size={16} />
          <span>引导</span>
        </button>
        <button
          aria-label="删除排队消息"
          className="cx-queued__icon-button"
          onClick={() => onRemove(item.id)}
          title="删除"
          type="button"
        >
          <CodexTrash aria-hidden size={16} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="更多操作"
              className="cx-queued__icon-button"
              title="更多"
              type="button"
            >
              <CodexEllipsis aria-hidden size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={6}>
            {item.attachments.length ? null : (
              <DropdownMenuItem onSelect={() => onEdit(item.id)}>编辑</DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onRemove(item.id)}>删除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
