/**
 * ARTEX · 会话块（conversation activity blocks）· 对外 barrel
 * ============================================================================
 * 真值来源：docs/SPEC-CONVERSATION-BLOCKS.md（SPEC）。
 * 本目录是 task-13「A · 对话块实现」的**独占写范围**，不依赖也不修改 src/chat 下的其它文件
 * （只从 @/icons 与 @/lib/utils 这两个公共 barrel 取值）。
 *
 * 对外 API
 * --------
 *   ActivityGroup({ blocks, spacing })   分组容器（SPEC §2.1：gap 16px / grouped 4px）
 *   ActivityBlock({ block })             单块分发
 *   ActivityDisclosure(…)                通用块骨架 + 折叠展开（要自己拼块头时用）
 *   BlockNode                            联合类型（见 types.ts 的逐字段注释）
 *
 * 接线示例
 * --------
 *   import { ActivityGroup, type BlockNode } from "@/chat/blocks";
 *   <ActivityGroup blocks={nodes} spacing="item" />
 *
 * 每块的证据强度（**不要越级宣称"与 Codex 一致"**）
 * -----------------------------------------------
 *   完整实测（DOM + computed style + 交互态）：exec(§4) / file-edit(§6) / diff(§7) / code(§11) / 骨架(§2)
 *   包内确证（源码字面量，未在真实会话跑到）：reasoning(§3) / 终端 ANSI(§5)
 *   **推断实现**（只有文案与数据模型确证）：approval(§8) / plan(§9) / search(§10) / error(§12)
 *
 * SPEC §13 的未实测清单（本目录逐条对应）
 * --------------------------------------
 *   1 推理块头图标 → 不渲染；2 ~~推理中文案~~ → ✅ 2026-10-10 已取到官方 zh-CN 原文（见 README §5.2）；3 审批 UI → 推断；
 *   4 计划 UI → 推断；5 搜索图标 → 不渲染；6 代码块语言图标 → 不渲染（留插槽）；
 *   7 命令失败态图标 → 不渲染（仅着色）；8 折叠箭头 20×20 → 自绘占位（形状未实测）；
 *   9 ANSI 真实呈现 → 按类名/色板实现；10 浅色主题 → 未实现（全部按 dark 实测值）；
 *   11 折展 duration → 200ms 推断（easing 有出处）；12 chatgpt-code-scrollport → 无样式，未涉及；
 *   13 text-size-chat token → 未声明，按实测 14px/21px 钉住。
 */

export { ActivityBlock, ActivityGroup } from "./ActivityBlock";
export { type AnsiSpan, AnsiText, normalizeCarriageReturns, parseAnsi } from "./AnsiText";
export { ApprovalBlock } from "./ApprovalBlock";
export { CodeBlockBlock, languageLabel } from "./CodeBlockBlock";
export { CopyButton } from "./CopyButton";
export { DiffBlock, DiffFallback, DiffLines, parseUnifiedDiff } from "./DiffBlock";
export { ActivityDisclosure, type ActivityDisclosureProps, DISCLOSURE_TRANSITION } from "./Disclosure";
export { ErrorBlock } from "./ErrorBlock";
export { ExecBlock } from "./ExecBlock";
export { FileChangeCard, FileEditBlock } from "./FileEditBlock";
export {
  CheckmarkLgLight12,
  DisclosureChevron20,
  PreviewToggleIcon,
  ScrollToBottomIcon,
  WrapToggleIcon,
} from "./icons";
export { PlanChevronIcon, PlanDownloadIcon, PlanOpenInPanelIcon } from "./icons-plan";
export { PlanBlock, type PlanSummaryHost, planMarkdown, setPlanSummaryHost } from "./PlanBlock";
export { ReasoningBlock, ReasoningMarkdown } from "./ReasoningBlock";
export { RollingNumber, type RollingNumberVariant } from "./RollingNumber";
export { SearchBlock } from "./SearchBlock";
export { TerminalBlock } from "./TerminalBlock";
export type {
  ActivityGroupProps,
  ActivityStatus,
  ApprovalNode,
  ApprovalStatus,
  BlockKind,
  BlockNode,
  CodeNode,
  DiffBlockNode,
  DiffLine,
  DiffLineType,
  ErrorNode,
  ExecNode,
  FileChangeNode,
  FileEditNode,
  PlanNode,
  PlanStep,
  PlanStepStatus,
  ReasoningNode,
  SearchAction,
  SearchNode,
  SearchResultRow,
  TerminalNode,
} from "./types";
export { useScrollFadeMask } from "./use-scroll-fade";

import "./blocks.css";
