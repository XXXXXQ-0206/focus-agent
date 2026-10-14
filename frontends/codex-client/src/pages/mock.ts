/**
 * 其余 rail 页面的演示数据（scheduled / plugins / explore / review）。
 *
 * 位置约定：本文件属于 src/pages 独占范围，**不改 src/lib/**（见 ARCHITECTURE.md §3 所有权矩阵）。
 * 接后端时替换本文件即可，四个页面组件不需要改。
 *
 * 官方数据来源（说明这些字段在真实实现里是什么）：
 *   · 定时任务：`automations.list`（app-initial:2132621 的正则 `^(?:automations|Automations|de1d73e)\.
 *     (create|update|run_now|list|peek)$` 证实工具名）+ 本地 automations store。
 *     行字段出处 automations-page-d71c8cae4d53.js 的 `de`/`fe` 映射：
 *     { automation, displayName, hasUnreadRuns, isPaused, nextRunAt, source: 'local' | 'cloud' }。
 *   · 插件：`/ps/v2/...` 插件目录查询（plugins-query-df6c7bdf37ed.js）+ 已安装集合
 *     （installed-plugins-547d247e5c32.js）。卡片字段出处 plugins-cards-grid-d70c90e35c0c.js。
 *   · 探索：官方无独立探索页（见 ExplorePage.tsx 头部说明），本页数据按官方 Explore feed
 *     的「来源筛选 + 卡片」形态构造，卡片内容取自官方 Explore 菜单目的地与插件目录结构。
 *   · 代码审查：GitHub CLI（gh）读取的 PR 列表，字段出处 pull-request-route-1150fdad8cb9.js。
 */

export type PagePhase = "loading" | "ready" | "empty" | "error";

/* ── 定时任务 ─────────────────────────────────────────────────────────────── */

export type AutomationStatus = "ACTIVE" | "PAUSED" | "COMPLETED";
export type AutomationSource = "local" | "cloud";

export interface AutomationRow {
  id: string;
  name: string;
  /** 任务提示词首行，官方行副标题位置 */
  prompt: string;
  status: AutomationStatus;
  source: AutomationSource;
  /** 所属小组；null = 官方 i18n `inbox.automations.teams.personalGroup`（个人） */
  teamId: string | null;
  /** 官方设置页 `settings.automations.scheduleSummary.*` 的目标形态：
   *  "Daily at {time}" / "Every {count} hours" / "Weekdays at {time}" / "{days} at {time}" */
  scheduleLabel: string;
  /** "Next run: {nextRunLabel}"（sidebarTaskRow.heartbeatAutomation.nextRun）；
   *  target 用官方 `inbox.automations.nextRun.none`（未排期）时置 null */
  nextRunLabel: string | null;
  lastRunLabel: string | null;
  hasUnreadRuns: boolean;
  /** 来源插件（官方 `inbox.automations.pluginSourceLabel` → From） */
  sourcePlugin?: string;
}

export interface AutomationTeam {
  id: string;
  name: string;
}

export const AUTOMATION_TEAMS: AutomationTeam[] = [{ id: "team-design", name: "设计组" }];

export const AUTOMATIONS: AutomationRow[] = [
  {
    id: "a1",
    name: "每工作日早报",
    prompt: "汇总昨天合并的 PR、未关闭的阻塞项，给出一段可转发的早报。",
    status: "ACTIVE",
    source: "local",
    teamId: null,
    scheduleLabel: "工作日 07:30",
    nextRunLabel: "明天 07:30",
    lastRunLabel: "今天 07:30",
    hasUnreadRuns: true,
  },
  {
    id: "a2",
    name: "依赖升级巡检",
    prompt: "检查 package.json 里的直接依赖，列出落后一个 minor 以上的项并给出升级顺序。",
    status: "ACTIVE",
    source: "local",
    teamId: null,
    scheduleLabel: "每周一 09:00",
    nextRunLabel: "周一 09:00",
    lastRunLabel: "上周一 09:00",
    hasUnreadRuns: false,
  },
  {
    id: "a3",
    name: "issue 分诊",
    prompt: "读取仓库新开的 issue，按模块打标签并给出优先级建议。",
    status: "PAUSED",
    source: "local",
    teamId: null,
    scheduleLabel: "每 6 小时",
    nextRunLabel: null,
    lastRunLabel: "3 天前",
    hasUnreadRuns: false,
    sourcePlugin: "GitHub",
  },
  {
    id: "a4",
    name: "设计稿变更同步",
    prompt: "比对设计稿导出目录的改动，生成一份给前端的变更清单。",
    status: "ACTIVE",
    source: "cloud",
    teamId: "team-design",
    scheduleLabel: "每天 18:00",
    nextRunLabel: "今天 18:00",
    lastRunLabel: "昨天 18:00",
    hasUnreadRuns: false,
  },
  {
    id: "a5",
    name: "周报草稿",
    prompt: "把本周的会话标题、提交记录和已完成任务整理成周报草稿。",
    status: "COMPLETED",
    source: "local",
    teamId: "team-design",
    scheduleLabel: "每周五 17:00",
    nextRunLabel: null,
    lastRunLabel: "上周五 17:00",
    hasUnreadRuns: false,
  },
  {
    id: "a6",
    name: "上游 CVE 监测",
    prompt: "监测依赖的上游安全公告，命中当前依赖树时给出结论。",
    status: "ACTIVE",
    source: "cloud",
    teamId: "team-design",
    scheduleLabel: "每天 08:00",
    nextRunLabel: "明天 08:00",
    lastRunLabel: "今天 08:00",
    hasUnreadRuns: true,
  },
];

/* ── 插件 ─────────────────────────────────────────────────────────────────── */

export type PluginState = "installed" | "available" | "installing" | "disabled" | "blocked";

export interface PluginCard {
  id: string;
  name: string;
  /** 作者 / 发布方，官方卡片 `Shared by {name}` 或 `You`（plugins.card.creator.you） */
  author: string;
  description: string;
  /** 分类，用于探索页与插件页的筛选 */
  category: string;
  state: PluginState;
  /** 官方 `plugins.card.disabledByAdmin` → 管理员已停用 */
  disabledByAdmin?: boolean;
  /** 官方 `skills.appsPage.section.connected` 里的连接状态点 */
  connected?: boolean;
}

export const PLUGIN_CATEGORIES = ["全部", "开发", "协作", "数据", "设计", "运维"] as const;

export const PLUGINS: PluginCard[] = [
  {
    id: "p-github",
    name: "GitHub",
    author: "OpenAI",
    description: "读取仓库、issue 与 Pull Request，让 Codex 直接参与代码审查与修复。",
    category: "开发",
    state: "installed",
    connected: true,
  },
  {
    id: "p-linear",
    name: "Linear",
    author: "OpenAI",
    description: "把 issue 与项目进度带进对话，可直接创建和更新工单。",
    category: "协作",
    state: "installed",
    connected: true,
  },
  {
    id: "p-slack",
    name: "Slack",
    author: "OpenAI",
    description: "检索频道与私信，汇总讨论结论，必要时回复消息。",
    category: "协作",
    state: "installed",
    connected: false,
  },
  {
    id: "p-figma",
    name: "Figma",
    author: "OpenAI",
    description: "读取设计稿的图层与标注，生成与设计一致的实现清单。",
    category: "设计",
    state: "available",
  },
  {
    id: "p-postgres",
    name: "Postgres",
    author: "OpenAI",
    description: "只读连接数据库，用 SQL 回答数据问题并生成报表。",
    category: "数据",
    state: "available",
  },
  {
    id: "p-sentry",
    name: "Sentry",
    author: "OpenAI",
    description: "按错误率与影响面聚合线上异常，给出定位线索。",
    category: "运维",
    state: "available",
  },
  {
    id: "p-notion",
    name: "Notion",
    author: "OpenAI",
    description: "搜索空间里的页面，把结论沉淀回文档。",
    category: "协作",
    state: "installed",
    connected: true,
  },
  {
    id: "p-browser",
    name: "Browser",
    author: "OpenAI",
    description: "在受控浏览器里打开页面、抓取内容并截图核对。",
    category: "开发",
    state: "installed",
    connected: true,
  },
  {
    id: "p-stripe",
    name: "Stripe",
    author: "OpenAI",
    description: "查询订阅与账单状态，分析付款失败的原因分布。",
    category: "数据",
    state: "disabled",
  },
  {
    id: "p-terraform",
    name: "Terraform",
    author: "Hashicorp",
    description: "解释 plan 的改动范围，标出可能影响线上资源的项。",
    category: "运维",
    state: "blocked",
    disabledByAdmin: true,
  },
  {
    id: "p-playwright",
    name: "Playwright",
    author: "Microsoft",
    description: "运行端到端用例，回放失败步骤并定位到选择器。",
    category: "开发",
    state: "available",
  },
  {
    id: "p-airtable",
    name: "Airtable",
    author: "OpenAI",
    description: "读写表格视图，按视图维度筛选记录。",
    category: "数据",
    state: "available",
  },
];

/* ── 探索 ─────────────────────────────────────────────────────────────────── */

export interface ExploreCategory {
  id: string;
  label: string;
  /** 官方 `sidebar.explore.*` 目的地或 `skills.appsPage.section.*` 分组名 */
  description: string;
  /** 图标名，见 src/icons 的官方图标集 */
  icon: string;
}

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  {
    id: "featured",
    label: "精选",
    description: "官方 Explore feed 的「精选」来源，人工挑过的示例内容。",
    icon: "star",
  },
  {
    id: "setup",
    label: "上手 Codex",
    description: "官方 Explore 菜单里的 Setup Codex：打开云环境设置。",
    icon: "rocket",
  },
  {
    id: "plugins",
    label: "插件",
    description: "把外部工具接进来，让 Codex 在你的工具链里工作。",
    icon: "puzzle",
  },
  { id: "skills", label: "技能", description: "可复用的任务指令集，按场景组织。", icon: "lightbulb" },
  { id: "automations", label: "定时任务", description: "让 Codex 按计划自己跑起来。", icon: "clock" },
  { id: "review", label: "代码审查", description: "在 GitHub 上审查并跟踪工作。", icon: "code" },
];

export interface ExploreItem {
  id: string;
  title: string;
  description: string;
  /** 所属分类 id，与 EXPLORE_CATEGORIES 对齐 */
  category: string;
  /** 卡片角标，例如「官方」「社区」 */
  tag: string;
  /** 官方 Explore feed 的 `source` 维度 */
  source: "featured" | "evergreen" | "library";
}

export const EXPLORE_ITEMS: ExploreItem[] = [
  {
    id: "e1",
    title: "还原一个界面的完整几何",
    description: "把参考端截图、DOM 与 CSS 对齐，逐条写出可复算的数值证据。",
    category: "featured",
    tag: "官方",
    source: "featured",
  },
  {
    id: "e2",
    title: "为仓库生成一份架构说明",
    description: "扫描目录与依赖，产出模块图谱与调用链，标注每条结论的出处。",
    category: "featured",
    tag: "官方",
    source: "featured",
  },
  {
    id: "e3",
    title: "把定时任务接到通知渠道",
    description: "任务跑完后把摘要推送到 Slack 或邮件，失败时给出重试建议。",
    category: "automations",
    tag: "社区",
    source: "evergreen",
  },
  {
    id: "e4",
    title: "写一个自己的插件",
    description: "按插件清单暴露工具接口，本地调试后在插件页安装。",
    category: "plugins",
    tag: "官方",
    source: "evergreen",
  },
  {
    id: "e5",
    title: "整理一份技能库",
    description: "把重复出现的提示词固化成技能，按项目或团队共享。",
    category: "skills",
    tag: "官方",
    source: "evergreen",
  },
  {
    id: "e6",
    title: "PR 走查清单",
    description: "从改动面、测试覆盖与风险点三个角度生成走查清单。",
    category: "review",
    tag: "社区",
    source: "featured",
  },
  {
    id: "e7",
    title: "从零搭一个云环境",
    description: "配置好运行环境后把首个任务跑通。",
    category: "setup",
    tag: "官方",
    source: "library",
  },
  {
    id: "e8",
    title: "查询资料库里的历史产物",
    description: "按时间与类型检索过往生成的文档、表格与站点。",
    category: "featured",
    tag: "官方",
    source: "library",
  },
];

/** 官方 Explore feed 的来源筛选（开发档文案见 zh-Hans-6d9213662c0b.js；正式档取「精选/全部」两个） */
export const EXPLORE_SOURCES: { id: string; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "featured", label: "精选" },
  { id: "evergreen", label: "常青内容" },
  { id: "library", label: "资料库" },
];

/* ── 代码审查（Pull requests）────────────────────────────────────────────── */

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type PullRequestReviewState = "waiting" | "approved" | "changes_requested" | null;

export interface PullRequestRow {
  id: string;
  repository: string;
  number: number;
  title: string;
  author: string;
  state: PullRequestState;
  review: PullRequestReviewState;
  headBranch: string;
  baseBranch: string;
  /** 官方 `codeReview.sidebar.rowLastUpdated` → Updated {date} */
  updatedLabel: string;
  /** checks 摘要：官方 pull-request-checks-summary-1263255bdb7b.js */
  checks: { passing: number; failing: number; pending: number };
  changedFiles: number;
  additions: number;
  deletions: number;
  /** 官方 `codex.pullRequests.inbox.section.*` 分组 */
  section: "userReviewRequested" | "teamReviewRequested" | "reviewed" | "authored";
}

export interface ReviewRepository {
  id: string;
  name: string;
  openCount: number;
}

export const REVIEW_REPOSITORIES: ReviewRepository[] = [
  { id: "all", name: "所有仓库", openCount: 4 },
  { id: "r1", name: "artex/codex-desktop-src", openCount: 2 },
  { id: "r2", name: "artex/artex-web", openCount: 1 },
  { id: "r3", name: "artex/design-tokens", openCount: 1 },
];

export const PULL_REQUESTS: PullRequestRow[] = [
  {
    id: "pr-1180",
    repository: "artex/codex-desktop-src",
    number: 1180,
    title: "把侧栏折叠改成位移，去掉宽度动画",
    author: "xiongqian",
    state: "open",
    review: "waiting",
    headBranch: "fix/sidebar-offcanvas",
    baseBranch: "main",
    updatedLabel: "12 分钟前",
    checks: { passing: 6, failing: 0, pending: 1 },
    changedFiles: 4,
    additions: 96,
    deletions: 41,
    section: "userReviewRequested",
  },
  {
    id: "pr-1177",
    repository: "artex/artex-web",
    number: 1177,
    title: "补齐 rail 四个页面的路由与空态",
    author: "lin",
    state: "draft",
    review: null,
    headBranch: "feat/rail-pages",
    baseBranch: "main",
    updatedLabel: "1 小时前",
    checks: { passing: 0, failing: 0, pending: 4 },
    changedFiles: 11,
    additions: 812,
    deletions: 33,
    section: "teamReviewRequested",
  },
  {
    id: "pr-1164",
    repository: "artex/design-tokens",
    number: 1164,
    title: "圆角倍率 1.25 与超椭圆角形的回归修正",
    author: "chen",
    state: "open",
    review: "changes_requested",
    headBranch: "fix/corner-radius-scale",
    baseBranch: "main",
    updatedLabel: "昨天",
    checks: { passing: 3, failing: 2, pending: 0 },
    changedFiles: 2,
    additions: 24,
    deletions: 18,
    section: "userReviewRequested",
  },
  {
    id: "pr-1151",
    repository: "artex/codex-desktop-src",
    number: 1151,
    title: "官方 token 抽取脚本可复算化",
    author: "xiongqian",
    state: "merged",
    review: "approved",
    headBranch: "chore/token-extract",
    baseBranch: "main",
    updatedLabel: "3 天前",
    checks: { passing: 9, failing: 0, pending: 0 },
    changedFiles: 3,
    additions: 148,
    deletions: 12,
    section: "reviewed",
  },
  {
    id: "pr-1142",
    repository: "artex/artex-web",
    number: 1142,
    title: "会话列表虚拟滚动",
    author: "xiongqian",
    state: "closed",
    review: null,
    headBranch: "experiment/virtual-list",
    baseBranch: "main",
    updatedLabel: "上周",
    checks: { passing: 0, failing: 1, pending: 0 },
    changedFiles: 6,
    additions: 210,
    deletions: 205,
    section: "authored",
  },
];

/** 官方 PR 状态徽章文案：codeReview.sidebar.*Badge + pullRequestSidePanel.state.* */
export const PR_STATE_LABEL: Record<PullRequestState, string> = {
  open: "待审查",
  draft: "草稿",
  merged: "已合并",
  closed: "已关闭",
};

export const PR_REVIEW_LABEL: Record<Exclude<PullRequestReviewState, null>, string> = {
  waiting: "等待审查",
  approved: "已批准",
  changes_requested: "请求修改",
};
