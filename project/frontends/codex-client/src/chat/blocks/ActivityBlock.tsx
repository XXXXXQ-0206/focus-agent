import type { ReactNode } from "react";

import { ApprovalBlock } from "./ApprovalBlock";
import { CodeBlockBlock } from "./CodeBlockBlock";
import { DiffBlock } from "./DiffBlock";
import { ErrorBlock } from "./ErrorBlock";
import { ExecBlock } from "./ExecBlock";
import { FileEditBlock } from "./FileEditBlock";
import { PlanBlock } from "./PlanBlock";
import { ReasoningBlock } from "./ReasoningBlock";
import { SearchBlock } from "./SearchBlock";
import { TerminalBlock } from "./TerminalBlock";
import type { ActivityGroupProps, BlockNode } from "./types";

/**
 * 块分发 + 分组容器（SPEC §2.1）
 * ============================================================================
 * 接线契约（给 cx-behavior / Lead）：
 *
 *   import { ActivityGroup, type BlockNode } from "@/chat/blocks";
 *
 *   // 一轮里把渲染项映射成 BlockNode[]，间距按官方 data-spacing 语义给：
 *   <ActivityGroup blocks={nodes} spacing="item" />          // 默认 16px
 *   <ActivityGroup blocks={nodes} spacing="grouped" />       // 4px（分组内条目）
 *
 * 分组容器即 SPEC §2.1 的 `div.group/agent-activity.flex.flex-col.gap-[var(--conversation-item-gap,16px)]`，
 * 每个块自己就是 `div.outline-none[tabindex=-1][data-local-conversation-item-target-ids]` 那一层。
 *
 * 代码块（kind: "code"）不走折叠骨架：官方 markdown 围栏代码块是常显卡片（SPEC §11）。
 *
 * ⚠️ 接入时请**不要把内容包进额外容器**：块的左边界对齐由 .cx-block / .cx-disclosure 的
 *    padding 决定（正文 ps-6 = 24px、exec/diff 类不缩进），外部再包 padding 会破坏对齐。
 */

export function ActivityBlock({
  block,
  languageIcon,
}: {
  block: BlockNode;
  /** 代码块工具条左侧 20×20 语言图标（官方名称未实测，SPEC §13.6） */
  languageIcon?: ReactNode;
}) {
  switch (block.kind) {
    case "approval":
      return <ApprovalBlock block={block} />;
    case "code":
      return <CodeBlockBlock block={block} languageIcon={languageIcon} />;
    case "diff":
      return <DiffBlock block={block} />;
    case "error":
      return <ErrorBlock block={block} />;
    case "exec":
      return <ExecBlock block={block} />;
    case "file-edit":
      return <FileEditBlock block={block} />;
    case "plan":
      return <PlanBlock block={block} />;
    case "reasoning":
      return <ReasoningBlock block={block} />;
    case "search":
      return <SearchBlock block={block} />;
    case "terminal":
      return <TerminalBlock block={block} />;
    default:
      return null;
  }
}

export function ActivityGroup({ blocks, spacing = "item", className }: ActivityGroupProps) {
  return (
    <div
      className={className ? `cx-activity-group ${className}` : "cx-activity-group"}
      data-spacing={spacing}
    >
      {blocks.map((block) => (
        <ActivityBlock block={block} key={block.id} />
      ))}
    </div>
  );
}
