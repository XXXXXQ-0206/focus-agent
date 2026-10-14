import { cn } from "@/lib/utils";

/**
 * 转录区加载骨架。
 *
 * ⚠️ SPEC 未测（参考端采集时机上数据总是已就绪），几何按本工程节奏自定：
 *    行高取正文 14px / 行距 12px，与 .cx-messages 的 gap 一致，避免加载完成时跳动。
 *    动效走 --animation-duration-streaming-text 一档，data-reduced-motion 下关闭。
 */
export function ChatSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  const widths = ["100%", "92%", "78%", "96%", "64%", "88%", "70%"];
  return (
    <div aria-busy="true" aria-live="polite" className={cn("cx-skeleton", className)} role="status">
      <span className="cx-sr-only">正在加载会话…</span>
      {Array.from({ length: rows }, (_, index) => (
        <span
          aria-hidden
          className="cx-skeleton__row"
          key={index}
          style={{ width: widths[index % widths.length] }}
        />
      ))}
    </div>
  );
}
