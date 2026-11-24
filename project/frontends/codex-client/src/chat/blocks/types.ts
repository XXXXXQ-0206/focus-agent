/**
 * Focus · 会话块（conversation activity blocks）· 数据模型
 * ============================================================================
 * 真值来源：`docs/SPEC-CONVERSATION-BLOCKS.md`（下称 SPEC，857 行，官方逐层 DOM + 实测样式）
 *   块 2 / 3 / 5 / 6 / 11 = **完整实测**（DOM + computed style + 交互态）
 *   块 1 / 4              = **包内确证**（源码字面量完整，未在真实会话跑到）
 *   块 7 / 8 / 9 / 10     = 仅**文案与数据模型**确证，UI 结构为推断（SPEC §13）
 *
 * 本文件只定义「输入形状」。视觉一律在 blocks.css 里，逐条标出处。
 *
 * ⚠️ 写范围：本目录（src/chat/blocks/**）是 task-13 的独占写范围。
 *    不 import、不修改 src/chat 下的其它文件；接进 ChatConversation 由接线方完成。
 */

/** 块状态。SPEC §2.2 只确证了 `running` / 完成两态；failed / stopped 来自 SPEC §4.3 的文案表。 */
export type ActivityStatus = "running" | "completed" | "failed" | "stopped";

/** SPEC §4.2 / §6.2 的逐条出处见 blocks.css 顶部；这里只声明形状。 */
export interface ExecNode {
  kind: "exec";
  id: string;
  status: ActivityStatus;
  /** 命令文本（不含提示符；提示符 `$ ` 由组件渲染，SPEC §4.1） */
  command: string;
  /** 终端输出，可含 ANSI SGR 序列（SPEC §5） */
  output?: string;
  /** 退出码；failed 时状态行显示 `Failed with exit code {n}`（SPEC §4.3） */
  exitCode?: number | null;
  /** 类型标签行文案：Shell / Bash / PowerShell（SPEC §4.1，实测三类） */
  shell?: string;
  /** 块头摘要；缺省时按 SPEC §4.4 的 key 生成（`Running/Ran/Stopped <cmd>`） */
  summary?: string;
  /**
   * 初始是否展开。
   *
   * 历史：R4 曾判定「官方 exec 卡恒从折叠起步」，本类型刻意不放该字段。
   * **2026-10-20 用户改判**：运行过程里命令和输出全被折叠，看不到在执行什么；
   * 要求对齐原 Focus / DSH 的可见性。适配层现在对 `running` 传 true（边跑边看输出），
   * 结束后回落到折叠、块头仍显示「已运行 <命令>」，点一下随时能再展开。
   */
  defaultExpanded?: boolean;
  /** 工具执行耗时（毫秒）：块头显示「已在 Ns 内运行 <命令>」 */
  elapsedMs?: number;
}

/** 终端 ANSI 输出块（SPEC §5，包内确证）：与 exec 共用卡片外壳，但正文是纯 ANSI 文本。 */
export interface TerminalNode {
  kind: "terminal";
  id: string;
  status: ActivityStatus;
  text: string;
  shell?: string;
  exitCode?: number | null;
  summary?: string;
  /** ⚠️ 同 ExecNode：官方这张卡（`Jx`）没有「默认展开」这个输入，R4 后本类型不再有该字段 */
}

/** SPEC §7.2 的 Pierre 行类型。separator = `div[data-separator]`。 */
export type DiffLineType = "context" | "change-addition" | "change-deletion" | "separator";

/** 自建 diff 行模型的**唯一**来源是 SPEC §7.2 的 DOM 层级（我们不复刻 Pierre 的 shadow DOM）。 */
export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** 行号；separator 行省略。SPEC §7.2 的 `data-column-number` / `data-line-index` */
  oldNumber?: number | null;
  newNumber?: number | null;
}

/** 逐文件卡（SPEC §6.1）。added/deleted 对应 `+22` / `-17`。 */
export interface FileChangeNode {
  id: string;
  path: string;
  /** 新文件（apply_patch `*** Add File:` / diff 的 `--- /dev/null`）—— 摘要用「已创建」 */
  created?: boolean;
  /** 增删行数；缺省时**不渲染** +N/−M（[SPEC §6.1] 实测有该统计，但我们的数据模型不总有） */
  added?: number;
  deleted?: number;
  /** 行级 diff；给 unified 文本也行（本地解析器会切行） */
  lines?: DiffLine[];
  /** SPEC §7.4：`Too large to render inline` */
  tooLarge?: boolean;
  /** SPEC §7.4：`Binary file not shown` */
  binary?: boolean;
  /** SPEC §7.4：`File renamed without changes` */
  renamedWithoutChanges?: boolean;
  /** SPEC §7.4：`Diff failed to render` */
  renderFailed?: boolean;
  defaultExpanded?: boolean;
}

/** 文件读取 / 写入 / 编辑块（SPEC §6，完整实测）：分组卡 + 逐文件卡。 */
export interface FileEditNode {
  kind: "file-edit";
  id: string;
  status: ActivityStatus;
  files: FileChangeNode[];
  /** 分组摘要；缺省 = SPEC §6.3 `codex.unifiedDiff.editedFiles` 的 zh 形态 */
  summary?: string;
  defaultExpanded?: boolean;
}

/** 单独的 diff / 补丁预览块（SPEC §7，完整实测）。 */
export interface DiffBlockNode {
  kind: "diff";
  id: string;
  status: ActivityStatus;
  path: string;
  lines: DiffLine[];
  summary?: string;
  tooLarge?: boolean;
  binary?: boolean;
  renamedWithoutChanges?: boolean;
  renderFailed?: boolean;
  defaultExpanded?: boolean;
}

/** markdown 围栏代码块（SPEC §11，完整实测）。 */
export interface CodeNode {
  kind: "code";
  id: string;
  code: string;
  /** 语言标识（`ts` / `bash` …）；标签走 SPEC §11.4 的 `jn` 映射表 */
  language?: string;
  /** 缺省换行态（`aria-pressed`） */
  wrap?: boolean;
}

/** SPEC §3：推理 / 思考块（包内确证）。正文原样按 markdown 段落渲染。 */
export interface ReasoningNode {
  kind: "reasoning";
  id: string;
  status: ActivityStatus;
  content: string;
  /**
   * 完成态 + 有耗时 → `已思考 {elapsed}`；否则 `已完成思考`（SPEC §3.5 + 官方 zh-CN 原文）。
   *
   * ⚠️ 这**不是**必需的产出方：官方把计时放在推理组件内部（`Fw`：进入流式记 Date.now()、completed 翻牌结算），
   * 本目录 `useReasoningElapsed` 同样在组件内量（口径与格式的出处见 README §5.2）。
   * 节点自带 elapsed 时优先用节点的（服务端值 / fixtures），否则用组件实测值。
   */
  elapsed?: string;
  defaultExpanded?: boolean;
}

/** SPEC §8：审批（推断）。item.status 的原生取值见 SPEC §8.3。 */
export type ApprovalStatus = "inProgress" | "approved" | "denied" | "timedOut" | "aborted";
export interface ApprovalNode {
  kind: "approval";
  id: string;
  status: ApprovalStatus;
  /** action 文案（SPEC §8.1 的 `formatAction(intl, item.action)`）；本工程直接传已本地化文本 */
  action: string;
  /** 自动审批说明卡字段（SPEC §8.3：Status / Risk / Rationale） */
  reason?: string;
  risk?: string;
  response?: string;
  details?: string;
  defaultExpanded?: boolean;
}

/** SPEC §9：计划 / todo（推断）。 */
export type PlanStepStatus = "pending" | "in_progress" | "completed";
export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}
export interface PlanNode {
  kind: "plan";
  id: string;
  status: ActivityStatus;
  steps?: PlanStep[];
  /** `proposed-plan` / `plan-implementation` 的正文（SPEC §9.1） */
  content?: string;
  explanation?: string;
  summary?: string;
  defaultExpanded?: boolean;
}

/** SPEC §10：搜索（推断；文案确证）。 */
export type SearchAction = "searching" | "listing" | "reading";
export interface SearchResultRow {
  path: string;
  /** 命中行（可选） */
  line?: string;
  lineNumber?: number;
}
export interface SearchNode {
  kind: "search";
  id: string;
  status: ActivityStatus;
  action: SearchAction;
  query?: string;
  folder?: string;
  results?: SearchResultRow[];
  summary?: string;
  defaultExpanded?: boolean;
}

/** SPEC §12：错误 / 失败态（推断；文案确证）。 */
export interface ErrorNode {
  kind: "error";
  id: string;
  status: ActivityStatus;
  /** `System error` / `Stream error` / `Diff failed to render` … */
  title: string;
  message?: string;
  additionalDetails?: string;
  /** `Reconnecting {progress}`（SPEC §12） */
  reconnecting?: { attempt: number; total: number };
  defaultExpanded?: boolean;
}

export type BlockNode =
  | ApprovalNode
  | CodeNode
  | DiffBlockNode
  | ErrorNode
  | ExecNode
  | FileEditNode
  | PlanNode
  | ReasoningNode
  | SearchNode
  | TerminalNode;

export type BlockKind = BlockNode["kind"];

/** 分组间距 token（SPEC §2.1：默认 16px；分组内 4px）。 */
export interface ActivityGroupProps {
  blocks: BlockNode[];
  /** `data-spacing`：`item` | `grouped`（SPEC §2.1 的两种间距档） */
  spacing?: "item" | "grouped";
  className?: string;
}
