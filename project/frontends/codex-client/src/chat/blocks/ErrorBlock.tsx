import { ActivityDisclosure } from "./Disclosure";
import type { ErrorNode } from "./types";

/**
 * 错误 / 失败态块（SPEC §12，**推断**：文案确证）
 * ============================================================================
 * 文案（SPEC §12，逐条确证）：
 *   System error / Stream error（+ content + additionalDetails）/
 *   `localConversation.streamError.reconnecting` = `Reconnecting {progress}`
 *   `…serverOverloadedReconnecting` = `Server is busy, reconnecting`
 *   Optimization interrupted / Compaction interrupted / Turn ended by Auto-review
 *
 * ⚠️ **推断实现**（SPEC §13 未覆盖但同样无实测）：错误项的容器、图标、配色都未实测。
 *    SPEC §12 只写"段落 + 正文"，因此这里就是「段落 + 正文」，不编卡片。
 * ⚠️ SPEC §12 末行：只实测到"命令状态行换图标"，**失败态图标未实测** →
 *    本块不渲染图标。
 * ⚠️ 重连态的中文未确证 → 用「正在重连 {a}/{b}」（en: Reconnecting {progress}）。
 */

export function ErrorBlock({ block }: { block: ErrorNode }) {
  const { additionalDetails, message, reconnecting, status, title } = block;
  const reconnectingText = reconnecting ? `正在重连 ${reconnecting.attempt}/${reconnecting.total}` : null;
  const hasBody = Boolean(message || additionalDetails || reconnectingText);

  return (
    <ActivityDisclosure
      active={status === "running"}
      bodyVariant="default"
      hasBody={hasBody}
      indent={false}
      itemId={block.id}
      status={status}
      summary={
        <>
          <span className="cx-error__title" data-tone={reconnecting ? "warning" : "danger"}>
            {title}
          </span>
          {reconnectingText ? <span className="cx-error__inline-note"> {reconnectingText}</span> : null}
        </>
      }
      defaultExpanded={block.defaultExpanded}
    >
      <div className="cx-error">
        {message ? <p className="cx-error__message">{message}</p> : null}
        {additionalDetails ? <p className="cx-error__details">{additionalDetails}</p> : null}
        {reconnectingText ? <p className="cx-error__details">{reconnectingText}</p> : null}
      </div>
    </ActivityDisclosure>
  );
}
