import { type ReactNode, useCallback, useState } from "react";

import { ActivityDisclosure } from "./Disclosure";
import { PlanChevronIcon, PlanDownloadIcon, PlanOpenInPanelIcon } from "./icons-plan";
import type { PlanNode, PlanStep } from "./types";

/**
 * 计划 / todo 列表块（SPEC-CONVERSATION-BLOCKS §9，**推断**）
 * ============================================================================
 * 数据模型（SPEC §9.1，**确证**）：
 *   todo-list / proposed-plan / plan-implementation 三种；
 *   进行中判定 `plan.some(s => s.status !== "completed")`；
 *   导出文本 `Plan` + `- [x] step` / `- [ ] step`。
 *
 * 块头动作组（**本轮新增**）——依据 = 官方渲染代码 + 官方 i18n 原文：
 *   plan-summary-item-content-4662a5050d5a.js（19 299 B / 19 299 字符；JS 字符串下标，
 *   口径见 docs/OPEN-ITEMS.md §9.0）：
 *     @11814  localConversation.planSummary.download        默认文案 Download plan
 *     @12025  localConversation.planSummary.openInSidePanel 默认文案 Open plan in side panel
 *     @12258  localConversation.planSummary.expand          默认文案 Expand plan summary
 *             localConversation.planSummary.collapse        默认文案 Collapse plan summary
 *     @15076  L = cn("relative z-20 flex items-center gap-1", hidden && "hidden")  ← 动作组容器
 *     @15145  Tooltip(tooltipContent) > IconButton{ color:"ghost", size:"icon",
 *             "aria-label":<文案>, onClick }，子节点 <Icon className="icon-2xs" />，
 *             展开图标额外带 transition-transform + rotate-180
 *     @13861  onOpenInSidePanel 为 null 时**不渲染**该按钮
 *   图标 = icons-plan.tsx 的三枚官方内联 SVG（逐字节，非重绘）
 *
 * 证据边界（**不得宣称与 Focus 一致**）：
 *   · SPEC §13.4：计划卡的按钮组 **DOM 与几何未实测**。尺寸/圆角由官方类串 + 官方 CSS 推出：
 *     size:"icon" → `electron:p-1` + `[&>svg]:icon-sm`，.icon-sm{width:18px;height:18px}
 *     （shell-shared.css）⇒ **26×26**；radius("icon") → `rounded-full electron:rounded-md`
 *     （app-shared @7885513 / @7885785）⇒ electron 档 **10px**。**全部为推导**，无运行时读数。
 *   · Open in side panel 按官方条件**仅在有宿主回调时渲染**；本工程 blocks 层没有计划侧栏宿主
 *     ⇒ 默认不出现。宿主用 setPlanSummaryHost() 一行接上。
 *   · 三态图标 / 步骤行样式 / 正文布局仍未实测（SPEC §13.4），沿用上一轮推断实现。
 */

/** 计划卡宿主回调（对应官方 props.onOpenInSidePanel） */
export interface PlanSummaryHost {
  onOpenInSidePanel?: (block: PlanNode) => void;
}

let planSummaryHost: PlanSummaryHost = {};

/** 由会话宿主注入「在侧栏打开计划」。不注入 = 官方语义下该按钮不渲染。 */
export function setPlanSummaryHost(next: PlanSummaryHost) {
  planSummaryHost = next;
}

/** SPEC §9.1 的导出文本（completed → x，其余 → 空格） */
export function planMarkdown(block: PlanNode) {
  const lines: string[] = ["Plan"];
  for (const step of block.steps ?? []) {
    lines.push(`- [${step.status === "completed" ? "x" : " "}] ${step.step}`);
  }
  if (block.explanation) lines.push("", block.explanation);
  if (block.content) lines.push("", block.content);
  return lines.join("\n");
}

function StepMarker({ status }: { status: PlanStep["status"] }) {
  return <span aria-hidden className="cx-plan__marker" data-status={status} />;
}

/** 动作按钮：官方 IconButton{ color:"ghost", size:"icon" } 外包一层 Tooltip（tooltipContent = aria-label） */
function PlanAction({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="cx-plan__action"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function PlanBlock({ block }: { block: PlanNode }) {
  const { steps, status } = block;
  const streaming = status === "running";
  const allDone = Boolean(steps?.length) && !steps?.some((step) => step.status !== "completed");
  const title = block.summary ?? (streaming ? "正在编写计划" : "计划");
  const hasBody = Boolean(steps?.length) || Boolean(block.content) || Boolean(block.explanation);

  // 受控档：块头的 Expand/Collapse 按钮就是这个 state 的开关（官方 Jx 的 {expanded,onToggle} 形态）
  const [expanded, setExpanded] = useState(Boolean(block.defaultExpanded ?? streaming));
  const toggle = useCallback(() => setExpanded((value) => !value), []);

  const download = useCallback(() => {
    const blob = new Blob([planMarkdown(block)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.download = "plan.md";
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [block]);

  const openInSidePanel = planSummaryHost.onOpenInSidePanel;

  const headerActions = (
    <>
      <PlanAction label="Download plan" onClick={download}>
        <PlanDownloadIcon className="cx-plan__action-icon" />
      </PlanAction>
      {openInSidePanel ? (
        <PlanAction label="Open plan in side panel" onClick={() => openInSidePanel(block)}>
          <PlanOpenInPanelIcon className="cx-plan__action-icon" />
        </PlanAction>
      ) : null}
      <PlanAction
        label={expanded ? "Collapse plan summary" : "Expand plan summary"}
        onClick={toggle}
        pressed={expanded}
      >
        <PlanChevronIcon
          className="cx-plan__action-icon cx-plan__action-icon--chevron"
          data-expanded={expanded ? "true" : "false"}
        />
      </PlanAction>
    </>
  );

  return (
    <ActivityDisclosure
      active={streaming}
      bodyVariant="default"
      expanded={hasBody ? expanded : false}
      hasBody={hasBody}
      headerActions={hasBody ? headerActions : undefined}
      indent={false}
      itemId={block.id}
      onToggle={toggle}
      status={allDone ? "completed" : status}
      summary={title}
    >
      <div className="cx-plan">
        {block.explanation ? <p className="cx-plan__explanation">{block.explanation}</p> : null}
        {steps?.length ? (
          <ul className="cx-plan__steps">
            {steps.map((step, index) => (
              <li className="cx-plan__step" data-status={step.status} key={`${index}-${step.step}`}>
                <StepMarker status={step.status} />
                <span className="cx-plan__step-text">{step.step}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {block.content ? <pre className="cx-plan__content">{block.content}</pre> : null}
      </div>
    </ActivityDisclosure>
  );
}
