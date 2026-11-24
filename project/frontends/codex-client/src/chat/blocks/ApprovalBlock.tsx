import { ActivityDisclosure } from "./Disclosure";
import type { ApprovalNode } from "./types";

/**
 * 审批请求 / 用户决定块（SPEC §8，**推断**：组件源码确证，UI 未实测）
 * ============================================================================
 * 官方组件源码（SPEC §8.1，`sites-end-resource-ecc479065e0b.js` 的 `Kb`）逐字：
 *
 *   const isDenied = status === 'denied';
 *   const summary = <ActiveText active={isInProgress}
 *                     className="min-w-0 truncate text-text/30 group-hover/activity-header:text-default">{label}</ActiveText>;
 *   const content = icon === undefined
 *     ? <span className="inline-flex min-w-0 items-center gap-1.5"><Tone tone={isDenied ? 'warning' : 'default'} />{summary}</span>
 *     : summary;
 *   const body = isDenied ? <ReviewList reviews={[item]} /> : <Review review={item} />;
 *   return <Disclosure icon={icon} summary={content} shouldAnimateInitialCollapse={false}>{body}</Disclosure>;
 *
 * 待决态（同文件）：`<Label className="text-text/30" message="Awaiting approval" />`
 *
 * 状态 → 摘要（SPEC §8.3）：inProgress → 「等待批准」（shimmer）；approved / denied / timedOut → action 文案。
 *
 * ⚠️ **推断实现**（SPEC §13.3 明列未实测）：`Tone` 状态点的实现、批准/拒绝按钮组、
 *    键盘快捷键、`Review` / `ReviewList` 的布局**全部未实测**。
 *    → 本实现只落地"骨架 + 状态点 + 键值正文"，**故意不渲染批准/拒绝按钮**（无证据的交互不编）。
 * ⚠️ 块头图标未实测（SPEC §8.4：shield / shield-checkmark / lock 三候选都无证据）→ 不渲染图标。
 * ⚠️ 状态点外形未实测 → 用 6px 圆点（currentColor），仅表达 tone 语义。
 */

const STATUS_LABEL: Record<ApprovalNode["status"], string> = {
  aborted: "已中止",
  approved: "已批准",
  denied: "已拒绝",
  inProgress: "等待批准", // SPEC §8.3：localConversation.approvalRequest.inProgress = Awaiting approval
  timedOut: "已超时",
};

export function ApprovalBlock({ block }: { block: ApprovalNode }) {
  const { status } = block;
  const denied = status === "denied";
  const inProgress = status === "inProgress";
  const summary = inProgress ? STATUS_LABEL.inProgress : block.action;

  const rows: { label: string; value: string }[] = [];
  if (block.reason) rows.push({ label: "Reason", value: block.reason });
  if (block.risk) rows.push({ label: "Risk", value: block.risk });
  if (block.response) rows.push({ label: "Response", value: block.response });
  if (block.details) rows.push({ label: "Status", value: block.details });

  return (
    <ActivityDisclosure
      active={inProgress}
      bodyVariant="default"
      hasBody={Boolean(rows.length)}
      indent={false}
      itemId={block.id}
      status={status === "inProgress" ? "running" : status === "denied" ? "failed" : "completed"}
      summary={
        <span className="cx-approval__summary">
          {/* SPEC §8.1 的 Tone：warning（已拒绝）/ default */}
          <span className="cx-approval__tone" data-tone={denied ? "warning" : "default"} />
          <span className="cx-approval__label">{summary}</span>
        </span>
      }
      summaryTone="dim"
      defaultExpanded={block.defaultExpanded}
    >
      <div className="cx-approval__body">
        <div className="cx-approval__status">{STATUS_LABEL[status]}</div>
        {rows.length ? (
          <dl className="cx-approval__rows">
            {rows.map((row) => (
              <div className="cx-approval__row" key={row.label}>
                <dt className="cx-approval__row-label">{row.label}</dt>
                <dd className="cx-approval__row-value">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </ActivityDisclosure>
  );
}
