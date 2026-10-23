import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Composer, Message, useComposerSelection } from "@/chat";
import {
  CodexChevronDown12,
  CodexClock,
  CodexEllipsis,
  CodexFilter,
  type CodexIconProps,
  CodexLink,
  CodexPencil,
  CodexScrollToBottom,
  CodexStop,
  CodexTrash,
  CodexX,
} from "@/icons";
import { PanelPortal } from "@/shell";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

import { AUTOMATIONS, type AutomationRow, type AutomationStatus } from "./mock";
// ⚠️ task-75：`Badge` 原先只被**已删除的详情面板**用（状态徽标）；运行会话里官方没有这个徽标 ⇒ 一并去掉。
import { EmptyState, RowSkeleton } from "./parts";

/**
 * 定时任务页（rail 第 2 项，路由 /scheduled）。
 *
 * ── 真值来源 ────────────────────────────────────────────────────────────────
 * 路由：官方 rail 路由表 `app-initial-25361a10f2bf.js:43532`
 *   `scheduled: { path: \`/scheduled\`, sidebar: \`scheduled\`, destinationId: \`builtin:automations\`, rail: \`primary\` }`
 *   同页也挂在 `/automations`（`fRt()` 返回 \`/automations\`），`/inbox` 重定向到它。
 *   路由 element = 组件 `CSs`，Suspense fallback `ILa`（`app-initial:164633`）。
 * 页面业务体 = `automations-page-d71c8cae4d53.js`（103KB，导出 AutomationsLayoutPage）。
 *
 * 结构与几何（全部实测自官方 className，见 pages.css 头部 [A] 段）：
 *   页面根        `flex h-full min-h-0 flex-col`
 *   滚动体        `flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-6`
 *   分组容器      `flex flex-col gap-6 pt-4 select-none`
 *   分组 h2       `mx-3 flex min-w-0 items-center gap-2 border-b border-default pb-4
 *                  text-base font-normal text-tertiary`
 *   行列表        `-mx-3 flex flex-col gap-0.5` + role="list"
 *   工具条右侧    `ms-auto`
 *   详情出口      `DetailPanelOutlet`（未选中时渲染 `DetailPanel` + 空态组件 `Xs`）
 *
 * 文案（官方 i18n defaultMessage / zh-CN 译文，zh-CN-b05cfd55c534.js 实测）：
 *   inbox.mode.automations                      定时任务
 *   inbox.automations.subtitle                  让 ChatGPT 安排任务、设置提醒或监测更新
 *   inbox.automations.search                    搜索定时任务
 *   inbox.automations.create                    创建
 *   inbox.automations.createMenu.options        创建定时任务选项
 *   inbox.automations.createMenu.setUpManually  手动设置
 *   inbox.automations.createWithChatGPT         使用 ChatGPT 创建
 *   inbox.automations.createWithCodex           使用 Focus 创建
 *   inbox.automations.statusFilter.all/active/paused     全部 / 启用 / 已暂停
 *   inbox.automations.teams.ownershipFilter.option       All / Teams / Personal → 全部 / 团队 / 个人
 *   inbox.automations.teams.personalGroup       个人
 *   inbox.automations.selectScheduledTask       选择一个已安排的任务进行查看
 *   inbox.automations.detail.close              关闭已安排任务详情
 *   inbox.automations.status.active/paused/completed     启用 / 已暂停 / 已完成
 *   inbox.automations.loading                   正在加载定时任务
 *   inbox.automations.cloud.loadError           云端定时任务加载失败
 *   inbox.automations.cloud.loadError.retry     重试
 *   sidebarTaskRow.heartbeatAutomation.nextRun  Next run: {nextRunLabel} → 下次运行：{nextRunLabel}
 *   automations.runs.lastRun                    上次运行
 *   inbox.automations.pluginSourceLabel         From → 来自
 *   inbox.automations.emptySuggestion.add       Add {name} scheduled task → 添加 {name} 定时任务
 */
/**
 * 计划行文案（官方「有任务」态原文形制：**「明天 9时·每天」= 时间点 + `·` + 重复规则**）。
 * 一律用**数据层既有字段**拼、不硬编码任何字符串（task-56 要求 ②）：
 *   · 时间点   = `nextRunLabel`，例如「明天 07:30」
 *   · 重复规则 = `scheduleLabel` 去掉尾部的 `HH:MM`，例如「工作日 07:30」→「工作日」、「每 6 小时」原样
 *     （我们的 scheduleLabel 是「规则+时间」一体的，官方是分开的：规则在计划行、时间点在主面「日程安排」）
 * ⚠️ **与我们数据层的真实差异（不硬编去对）**：
 *   ① 官方时间点是「明天 9时」（12 小时制、只说小时），我们字段是「明天 07:30」（24 小时制、带分钟）；
 *   ② 官方规则「每天」，我们拆出来是「工作日 / 每周一 / 每 6 小时」——**形制对齐，字面值来自真实字段**；
 *   ③ 没有下次运行时间（已暂停/已完成）时官方未采集 ⇒ 只渲染规则本身，不编「未排期」之类的新文案。
 */
/** 官方 \`inbox.automations.status.paused\` 的译文（本文件上方 i18n 清单已列该 id；task-59 ④ 实测的暂停态计划行前缀）。 */
const PAUSED_PLAN_PREFIX = "已暂停";

function planLine(task: AutomationRow): string {
  const rule = task.scheduleLabel.replace(/\s*\d{1,2}:\d{2}$/, "") || task.scheduleLabel;
  /* [task-61] 暂停态官方原文形制（task-59 ④：面板计划行「明天 9时·每天」→ **「已暂停·每天」**）
     = 官方暂停措辞 + 分隔点 + 规则 ⇒ 直接复用官方那条 i18n 的译文，不新造词。 */
  if (task.status === "PAUSED") return `${PAUSED_PLAN_PREFIX}·${rule}`;
  return task.nextRunLabel ? `${task.nextRunLabel}·${rule}` : rule;
}

/**
 * [task-61] 官方 hero 的艺术字是**文本节点** 🕗（task-59 ① 实测：span 64.71×48 @775.98,347、
 * font-size 48px、weight 400、rgb(223,223,223)），不是图标组件。EmptyState 的 icon 槽只收组件，
 * 所以这里传一个只渲染该文本节点的组件；字号由 props.size 给（page 档 = 48），
 * 盒宽与居中交由 pages.css 的 page 档艺术块规则（那边配合放宽了宽度）。
 */
function ClockEmoji({ size }: CodexIconProps) {
  return <span style={{ fontSize: size, lineHeight: 1 }}>🕗</span>;
}

export function ScheduledRoute() {
  const [tasks, setTasks] = useState<AutomationRow[]>(AUTOMATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* ★ task-89：主面顶部那条 53px 工具条（含「状态/归属」两个分段筛选）**已撤** ——
     官方 1280 与 1600 两次全 DOM 扫描里，「全部/启用/已暂停/团队/个人/创建」的**可见元素计数全为 0**
     （见 docs/RECON-TASK80-BATCH3.md；官方面板顶部只有「定时任务」h1 + 「新建任务」行按钮 + 「即将执行」分区标题）。
     ⇒ 筛选 state（statusFilter/ownership）与随之而来的过滤分支一并撤掉，列表**恒显示全部**。
        · 若将来要保留筛选能力：必须放进**面板**并**另立官方依据**（本轮无依据，不自造）；
        · 工具条上那个「创建」下拉（手动设置 / 使用 ChatGPT 创建 / 使用 Focus 创建）**已随工具条撤掉**：
          官方没有这个入口；建任务主流程仍可从**面板「新建任务」按钮**与 hero 的「新建任务」进入
          （两处都走同一个 `setDraftName("")`，见本文件 onNewTask）。三个菜单项的去处由 Lead 决定。 */
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [phase] = useState<"ready" | "loading" | "error">("ready");
  const [draftName, setDraftName] = useState<string | null>(null);
  /* [task-71] 频率选择器的 UI 已随草稿面板撤掉（官方「重复计划」下拉与「时间」下拉
     本轮**未采集**，按任务书只渲染按钮本体）。draftSchedule 仍是新建时的排期值（初值即官方截图里的「每天 09:00」），
     去掉 setter 以免留下没人用的状态。 */
  const [draftSchedule] = useState("每天 09:00");

  /**
   * 面板头（shell 的 codex-panel__page-head）里的「新建任务」按钮 → 走 DOM 事件桥进到这里。
   * 复用**既有入口**：与主面空态那个「新建任务」按钮同一个动作（setDraftName("") → 打开右侧草稿详情）。
   * 为什么用事件而不是 props：面板（SidebarPanel）与页面（Outlet 里的本组件）是**兄弟**，
   * 页面内容还是经 PanelPortal 反向 portal 进面板的，没有共同祖先可传回调（见 panel-slot.tsx 头注释）。
   */
  useEffect(() => {
    const onNewTask = () => setDraftName("");
    window.addEventListener("codex:new-scheduled-task", onNewTask);
    return () => window.removeEventListener("codex:new-scheduled-task", onNewTask);
  }, []);

  /**
   * [task-61] 面板搜索胶囊（SidebarPanel 的页面态页头）→ 本组件的过滤词。
   * 同一条 DOM 事件桥的理由：面板与页面是**兄弟**（页面内容还经 PanelPortal 反向 portal 进面板），
   * 没有共同祖先可以传 props（见上方 codex:new-scheduled-task 注释与 panel-slot.tsx 头注释）。
   * ⚠️ 官方防抖量级未分辨（task-59 ②：DOM 变更落在打字后一次 CDP 往返之内，<150ms 或即时）
   *     ⇒ 这里**即时过滤**，不加防抖，也不声称与官方的调度方式一致。
   */
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      setSearchQuery(typeof detail?.query === "string" ? detail.query : "");
    };
    window.addEventListener("codex:scheduled-search", onSearch);
    return () => window.removeEventListener("codex:scheduled-search", onSearch);
  }, []);

  /* [task-56] 原先这里给面板页头那个放大镜做过一条「聚焦面板搜索框」的事件桥（task-51）。
     task-53 的官方「有任务」态采集显示：**面板滚动层第一件事就是分组标题行 [60,134]，上面没有搜索框**
     （搜索入口就是页头里那个放大镜，点击后是什么仍未采集）⇒ 我们那个搜索框连同事件桥一起撤掉，
     放大镜回到「只渲染按钮本体、交互未实测」。 */

  /**
   * 「没有已安排任务」= 官方那次采集的状态（面板：即将执行 + 暂无已安排的任务；主面：安排任务）。
   * 只有这个状态才用官方空态块；**有任务时保持我们现有的分组列表不动**
   * （官方「有任务时」的面板形态本轮未采集，拿空态去替换有任务的布局会越改越远 —— Lead 裁决）。
   */
  const panelEmpty = phase === "ready" && tasks.length === 0;

  /* [task-56] 原先这里还有一条 query 文本过滤（给面板那个搜索框用）。官方「有任务」态的面板里
     没有搜索框 ⇒ 搜索框与 query 一起撤掉。（那条注释里说的「保留主面工具条上两个分段筛选」
     已在 task-89 撤销：官方全 DOM 扫描证明工具条不存在。） */
  const visible = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      /* ★ task-89：原先这里还有 statusFilter / ownership 两条筛选分支 —— 工具条撤掉后它们**不可达**，
         按「不留死代码」一并删除（列表恒显示全部，与官方无筛选一致）。 */
      /* [task-61] 搜索过滤：官方 task-59 ② 实测「输入即过滤」（tas → 只剩 1 行；zzz / q → 0 行）。
         匹配口径（**我们的选择，官方未采集**）：行上可见的两段文字 —— 标题 task.prompt + 计划行 planLine，
         大小写不敏感；用 name 兜底（我们数据层里 name 是短标签，官方行标题就是说明）。 */
      if (needle) {
        const haystack = `${task.prompt} ${task.name} ${planLine(task)}`.toLocaleLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [tasks, searchQuery]);

  /* [task-56] 官方「有任务」态采到的面板只有**一个**分组标题「即将执行」（与空态是同一个元素），
     没有按团队分的多个 section ⇒ 原先那个 `groups`（按 teamId 分组、个人在前）随之删除。
     ⚠️ 官方在有多个团队时是否分 section **本轮未采集**，不自造。 */

  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  /**
   * ★ task-75：选中已排任务 → 主面渲染**运行会话**（官方 /scheduled 选中态）。
   *
   * 数据口径（照 task-75 的裁决，不要发挥）：
   *   · 我们**没有后端**、任务不会真跑 ⇒ 只渲染官方「**刚创建完、助手尚未回复**」那一态；
   *   · 用户消息 = **任务名** + 官方那个 **markdown 段落**「日程安排：<时间点>」；
   *     ⚠️ 主面用「**每天 9:00**」（无前导零），与面板计划行的「明天 9时·每天」**不是同一套文案**；
   *   · **不伪造助手回复、不伪造错误信息**（官方截图里那条 401 错误卡是本轮**不做**的分支）。
   *
   * 复用 `src/chat/Message.tsx`（气泡 + markdown + 时间戳显隐 + 复制/编辑两条 25.33×25.33）——
   * 它与官方那条消息同构，所以「20px 段落间距」由 markdown 段落规则给出，**这里不要自己加 gap**。
   * ⚠️ `Message.tsx:44` 的 `formatClock` 是模块私有且 `padStart(2,'0')` ⇒ **只能渲染时间戳**；
   *    「日程安排」那行必须在**内容字符串**上去掉前导零，不要去改 `formatClock`。
   *
   * 出处：docs/RECON-TASK69-SELECTED-STATE.md（A1/A2/A3/A4）。
   */
  /** 主面「日程安排」行与右侧摘要面板**共用**的计划文案：官方都是「每天 9:00」（**无前导零**）。
   *  与面板/列表行那套「明天 9时 · 每天」**不是同一套文案**（RECON-TASK69 §A2 明确写了这一点）。
   *  前导零在这里去掉（`formatClock` 不能动，那只管时间戳）。 */
  const runScheduleText = selected ? selected.scheduleLabel.replace(/(\s)0(\d:\d{2})/, "$1$2") : null;

  /**
   * 居中日期分隔的文案（官方实测原文「今天 19:25」）。
   * 官方 DOM：外层 `div.flex.justify-center.py-4`（padding 16px 0）→ `time.text-sm.leading-5.font-normal
   * .text-tertiary.select-none`（13px/20px/400 rgba(255,255,255,.498)）→ 内层 `span.font-medium`「今天」w500。
   * ★ **官方没有 hr、没有 ::before/::after、没有两侧渐变线**（页面 `hr` 计数 0、伪元素 content 全 none）
   *   ⇒ **不要加横线**。
   * ⚠️ 它的**出现条件未实测**（官方那次只出现一个日期）⇒ 我们按「当天第一条消息之前」渲染（本工程口径）。
   */
  const composerSelection = useComposerSelection();
  /**
   * ★ task-89：发送 = **本地回声**（本页没有后端、任务不会真跑）。
   * 官方运行会话里这个输入区真实发送行为**本轮未采集** ⇒ 不伪造助手回复，只把用户输入追加进转录，
   * 让输入区不是「按键无反应」的死控件；行为口径与「不伪造助手回复」的既有裁决一致。
   */
  const onRunSend = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    setFollowUps((prev) => [...prev, trimmed]);
  }, []);

  const runMessage = useMemo(() => {
    if (!selected) return null;
    return {
      id: `scheduled-run-${selected.id}`,
      // 会话 id：本条「运行会话」的稳定键（没有后端 ⇒ 不与任何真实会话冲突）
      conversationId: `scheduled-${selected.id}`,
      role: "user" as const,
      content: `${selected.name}\n\n日程安排：${selected.scheduleLabel.replace(/(\s)0(\d:\d{2})/, "$1$2")}`,
      // 任务「刚创建完」的那个时刻：本地无后端，用**选中这一刻**作为创建时间（不编造历史时间）
      createdAt: new Date().toISOString(),
    };
  }, [selected]);

  /** 居中日期分隔的文案（见上面那段官方逐值注释；在 runMessage 之后求值 ⇒ 顺序不能提前）。 */
  const runDateLabel = useMemo(() => {
    if (runMessage == null) return null;
    const at = new Date(runMessage.createdAt);
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    return { iso: runMessage.createdAt, clock: `${hh}:${mm}` };
  }, [runMessage]);

  const runNow = (id: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, lastRunLabel: "刚刚", hasUnreadRuns: true } : task)),
    );
  };

  const togglePause = (id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: (task.status === "PAUSED" ? "ACTIVE" : "PAUSED") as AutomationStatus }
          : task,
      ),
    );
  };

  const remove = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const commitDraft = () => {
    const name = (draftName ?? "").trim();
    if (!name) return;
    const created: AutomationRow = {
      id: `a-${Date.now()}`,
      name,
      /* [task-71] 新建对话框只有「说明」一个字段，而列表行标题渲染的是 prompt
         （见行渲染处注释：官方行标题就是用户在对话框里写的说明）⇒ 把说明同时写进 prompt，
         否则新建出来的行标题是空的。数据流仍是既有 commitDraft()，只补这一个字段的映射。 */
      prompt: name,
      status: "ACTIVE",
      source: "local",
      teamId: null,
      scheduleLabel: draftSchedule,
      nextRunLabel: `明天 ${draftSchedule.replace(/^每天\s*/, "")}`,
      lastRunLabel: null,
      hasUnreadRuns: false,
    };
    setTasks((prev) => [created, ...prev]);
    setDraftName(null);
    setSelectedId(created.id);
  };

  const isDrafting = draftName != null;

  /**
   * [task-71] 新建任务改成**官方对话框**（task-53 采集：official-task53-has-tasks.json 的 dialog 段
   * + 截图 official-task53-new-task-step1.png）。原来那张右侧草稿面板（本工程私有设计）撤掉。
   * 触发入口不变：面板「+ 新建任务」与工具条「创建 / 手动设置」都还走 setDraftName("")。
   * 取消 / 关闭对话框 / Esc ⇒ 关闭且**不提交**；创建 ⇒ 仍走既有 commitDraft()。
   */
  const closeDraft = useCallback(() => setDraftName(null), []);

  useEffect(() => {
    if (!isDrafting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDraft();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDraft, isDrafting]);

  /* 对话框里「重复」显示规则、「时间」显示时间点 —— 都从既有 draftSchedule 派生，不硬编字面量。
     ⚠️ 官方那张截图的时间field 是「中国时间 09:00」（带**本机时区标签**），
        我们的数据层没有时区标签 ⇒ 只渲染时间点，时区前缀登记为**未实测/未实现**。 */
  const draftRule = draftSchedule.replace(/\s*\d{1,2}:\d{2}$/, "") || draftSchedule;
  const draftTime = draftSchedule.match(/\d{1,2}:\d{2}$/)?.[0] ?? "";

  /* 说明字段用受控 textarea（官方是 ProseMirror 的 contenteditable div；**不搬 ProseMirror、不加依赖**）。
     打开那一次聚焦并把光标落到末尾 —— 官方采集时该字段是 focused 态。 */
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const node = editorRef.current;
    if (isDrafting && !wasOpenRef.current && node) {
      node.focus();
      const end = node.value.length;
      node.setSelectionRange(end, end); /* 光标落到末尾（「编辑」入口会把说明预填进来） */
    }
    wasOpenRef.current = isDrafting;
  }, [isDrafting]);

  /**
   * [task-61] 主面 hero（官方两态共用；逐条出处见下方使用处注释）。
   * ⚠️ 已知偏差：EmptyState 渲染的标题标签是 **h2**，官方实测是 **h1**
   *    （字号/行高/字重/字距 18/26/400/-0.025em 已在 pages.css 的 page 档标题规则里对齐）。
   *    改标签要动 src/pages/parts.tsx —— **不在本任务写范围内** ⇒ 登记为已知偏差，交 Lead 裁决。
   */
  const scheduledHero = (
    <EmptyState
      actions={
        <Button
          color="primary"
          gutterSize="md"
          onClick={() => setDraftName("")}
          pill
          size="xl"
          variant="solid"
        >
          新建任务
        </Button>
      }
      description="ChatGPT 可以帮你处理持续性任务，让你不必亲自动手。"
      icon={ClockEmoji}
      layout="page"
      title="安排任务"
      titleAs="h1"
    />
  );

  /**
   * [task-71] 官方「设置定时任务」对话框。官方读数（captures/recon-official/official-task53-has-tasks.json 的 dialog 段）：
   *   容器 680×420.7 @300,81.6（= 视口 1280×816 下**水平居中** + top 10%）、背景 rgb(45,45,45)、**圆角 30px**、
   *   padding 0、z-index 50、阴影三串；说明字段 602.7×20 @338.7,164.3；重复按钮 55.7×40 @883.6,289.6；
   *   时间 input 96×20 @815.3,347.6 ＋ 同名按钮 20×20 @919.3,347.6；高级 67.7×28 @320,398.3；
   *   取消/创建各 61.3×36 @825.3,898.7 行；关闭对话框 32×32 @934,97.6。
   * ⚠️ **未实测 ⇒ 只渲染本体、不实现**：重复计划与时间两个下拉、高级展开、字段框/分组的圆角与描边色
   *   （截图目测，未量）、是否存在遮罩、点击对话框外是否关闭。Esc/取消/关闭对话框三个关闭路径是任务书要求的。
   */
  const dialog = isDrafting ? (
    <div aria-label="设置定时任务" className="cx-sched-dialog" role="dialog">
      <div className="cx-sched-dialog__box">
        <span className="cx-sched-dialog__title">设置定时任务</span>
        <Button
          aria-label="关闭对话框"
          className="cx-sched-dialog__close"
          onClick={closeDraft}
          size="lg"
          uniform
          variant="ghost"
        >
          <CodexX size={16} />
        </Button>

        <div className="cx-sched-dialog__desc">
          {/* 官方这里是 div.ProseMirror[contenteditable]（富文本）。我们**不搬 ProseMirror、不加依赖**，
              按任务书用工程内最省的做法：语义化 <textarea>（官方 aria-label「说明…」照搬、placeholder 同名、
              原生支持多行）。⚠️ 元素类型与官方不同（div → textarea）⇒ 结构上是**有意偏离**，登记在交付里；
              好处是 a11y 语义正确（contenteditable div 会触发 biome 的 useSemanticElements 诊断）。 */}
          <textarea
            aria-label="说明…"
            className="cx-sched-dialog__editor"
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="说明…"
            ref={editorRef}
            rows={1}
            value={draftName ?? ""}
          />
        </div>

        <div className="cx-sched-dialog__group">
          <div className="cx-sched-dialog__row">
            <span className="cx-sched-dialog__row-label">重复</span>
            {/* 官方这个按钮带 aria-label="重复计划"（capture 的 items 段实测），文本是「每天」——照搬。 */}
            <Button aria-label="重复计划" className="cx-sched-dialog__repeat" size="2xl" variant="ghost">
              {draftRule}
              <CodexChevronDown12 />
            </Button>
          </div>
          <div className="cx-sched-dialog__row cx-sched-dialog__row--time">
            <span className="cx-sched-dialog__row-label">时间</span>
            <span className="cx-sched-dialog__time">
              <input aria-label="时间" className="cx-sched-dialog__time-input" readOnly value={draftTime} />
              <Button aria-label="时间" size="3xs" uniform variant="ghost">
                <CodexChevronDown12 />
              </Button>
            </span>
          </div>
        </div>

        <Button className="cx-sched-dialog__advanced" size="md" variant="ghost">
          高级
          <CodexChevronDown12 />
        </Button>

        <div className="cx-sched-dialog__footer">
          <Button className="cx-sched-dialog__action" onClick={closeDraft} pill size="xl" variant="outline">
            取消
          </Button>
          <Button
            className="cx-sched-dialog__action"
            color="primary"
            onClick={commitDraft}
            pill
            size="xl"
            variant="solid"
          >
            创建
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="cx-page" data-page="scheduled">
      {/* ★ task-89：**这里原先是一条 53px 高的 `.cx-page__toolbar`**（两个分段筛选 + 一个「创建」下拉），
          官方**不存在**：task-80 在 1280 与 1600 两次全 DOM 扫描，「全部/启用/已暂停/团队/个人/创建」
          的可见元素计数**全为 0**（含隐藏视图）⇒ 它正是「我们主面 y=143 vs 官方 96、高 669 vs 716」的原因。
          撤掉后主面 frame 应逼近官方 ._MainContentFrame_ **935.33×716 @340.67,96**（见 docs/RECON-TASK80-BATCH3.md）。
          功能去处：筛选能力若要保留必须进**面板**且另立依据（本轮无依据）；「创建」下拉的三个菜单项由 Lead 决定。
          出处：docs/RECON-TASK80-BATCH3.md「目标 3」+ docs/TASK75-SCHEDULED-RUN-SESSION.md §2 差异 1。 */}

      <div className="cx-split" data-panel-layout="panel">
        {/* task-28：官方 /scheduled 的列表住在 aside(340) 里（probe.results.aside.first.text
            含「定时任务 新建任务 即将执行 暂无已安排的任务」），主面只留空态/详情。
            面板槽不存在时（面板收起）列表不渲染 —— 与官方一致：面板是列表的唯一容器。 */}
        <PanelPortal>
          {panelEmpty ? (
            /* 官方「没有已安排任务」时的面板内容（task-44；逐值出处见 sidebar-panel.css 那段注释）：
                 分组标题「即将执行」[68,138.5 222×21] 14/500/21 rgba(255,255,255,.498)
                 空态行「暂无已安排的任务」[60,169 272×26.56] 13/430/18.5714 padding 4px 8px **role="status"**
               类放在 src/shell/sidebar-panel.css（**不碰** pages.css，那有另一组在做）。 */
            /* [task-55] 去掉死类名 codex-panel__page-empty（CSS 从无该规则，只有 -section/-list/-row 三个子类）；
               **必须保留 data-panel-page-empty**：sidebar-panel.css:813 的
               .codex-panel__scroll:has([data-panel-page-empty]) 靠它生效。 */
            <div data-panel-page-empty="">
              <div className="codex-panel__page-empty-section">
                {/* 官方是**两层**：行 div.group/nav-section-title [60,134 272×30]（padding 0 6px 0 8px）
                    里才是标题 div [68,138.5 222×21] ⇒ 照结构分两层，别把行和标题合成一个。 */}
                <div className="codex-panel__page-section-title">
                  <div className="codex-panel__page-section-label">即将执行</div>
                  {/* 筛选按钮（task-51）。官方 task-48 实测：
                        button[aria-label="任务筛选"] [298,135.33 **28×28**]，r 9.375px / cs SE1.5 /
                        色 rgba(255,255,255,.498)；内部 svg **16×16 @[304,141.33]**（居中）；
                        行内位置 = 文字 222 + **8px 间距** + 28 = 258（行内容宽）。
                      ⚠️ **图标形状未实测**（capture 只记 aria-label 与几何，未取 svg path）⇒
                         用工程内既有的 CodexFilter（搬运自官方 filter-light-16）**承接**，不声称一致。
                      ⚠️ **交互未实测**：官方点击后是什么（浮层？筛选菜单？）本轮未采集；本工程没有可复用的
                         「打开筛选菜单」入口（筛选是主面那排**常显**的分段控件）⇒ 按任务书要求
                         **只渲染按钮本体，不编假动作**。 */}
                  <button aria-label="任务筛选" className="codex-panel__icon-button" type="button">
                    <CodexFilter size={16} />
                  </button>
                </div>
                <div className="codex-panel__page-empty-list">
                  <div className="codex-panel__page-empty-row" role="status">
                    暂无已安排的任务
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 官方「有任务」态（task-53 采集）：滚动层第一件事就是**分组标题行 [60,134]**，
               **上面没有搜索框**（搜索入口是页头里那个放大镜）；分组标题与空态**完全同一套类**。
               ⚠️ 原来这一支里还有：搜索框、按团队分的多个 section（个人/设计组）、
                  行内三个按钮（立即运行/暂停/删除）与状态文字、和时钟图标 ——
                  官方「有任务」态采到的面板里**都没有** ⇒ 一并撤掉（运行/暂停/删除在主面详情里仍在）。 */
            /* ★ 必须包一层 __page-section：官方结构是「滚动层 ▸ section(gap 4) ▸ 标题行 + 列表」，
               少了这层 gap，列表会紧贴标题行 ⇒ 实测行跑到 y=**164**（官方 168）——第一版就是这么错的，
               实测抓出来的。 */
            <div className="codex-panel__page-section">
              <div className="codex-panel__page-section-title">
                <div className="codex-panel__page-section-label">即将执行</div>
                {/* 筛选按钮与空态**同一个类、同一个 aria-label**（官方两态里它是同一个按钮） */}
                <button aria-label="任务筛选" className="codex-panel__icon-button" type="button">
                  <CodexFilter size={16} />
                </button>
              </div>

              {phase === "loading" ? <RowSkeleton rows={3} /> : null}

              {phase === "error" ? (
                <div className="codex-panel__page-list">
                  <div className="codex-panel__page-empty-row" role="status">
                    云端定时任务加载失败
                  </div>
                </div>
              ) : null}

              {phase === "ready" && visible.length === 0 ? (
                <div className="codex-panel__page-list">
                  {/* [task-61] 官方无结果文案（task-59 ② 原文）：**「没有匹配的任务」**，位于「即将执行」下方。 */}
                  <div className="codex-panel__page-empty-row" role="status">
                    没有匹配的任务
                  </div>
                </div>
              ) : null}

              {phase === "ready" && visible.length > 0 ? (
                <div className="codex-panel__page-list">
                  {visible.map((task) => (
                    /* 行容器与行、行内操作钮分三层：外面 wrap 定位（官方行容器是 div.group.relative）、
                       里面是可选中的真 button（本工程面板既有写法 .codex-panel__row-wrap/_row 同构），
                       操作钮是 wrap 的兄弟 —— 避免 button 里再嵌 button。 */
                    <div className="codex-panel__page-row-wrap" key={task.id}>
                      <button
                        aria-pressed={task.id === selectedId}
                        className="codex-panel__page-row"
                        data-selected={task.id === selectedId ? "true" : undefined}
                        onClick={() => setSelectedId(task.id)}
                        type="button"
                      >
                        {/* 标题 = 官方那个「说明」字段的原文（官方行标题就是用户在新建对话框里写的说明；
                            我们的 name 是短标签、prompt 才是说明 ⇒ 这里用 prompt）。 */}
                        <span className="codex-panel__page-row-title">{task.prompt}</span>
                        <span className="codex-panel__page-row-plan">{planLine(task)}</span>
                      </button>
                      {/* [task-58] 菜单（官方 task-57 实测）：容器 220×150.81 @103,208.33、
                          bg oklab(0.297161…/0.9)、**r 20**、padding 4、z 50；5 条各 212×28.56（步进 28.56、
                          13px/18.5714px、padding 5px 8px、**r 15**、**都带图标**）：
                          **暂停 / 立即运行 / 编辑 / 分享 / 删除**；hover 置 data-highlighted + bg rgba(255,255,255,.08)；
                          无快捷键；Esc 关闭；**删除是唯一红色 rgb(255,103,100)**。
                          ⚠️ 图标**形状未实测**（capture 只记了「都带图标」）⇒ 用工程内既有图标承接，不声称一致。
                          ⚠️ 动作映射：**暂停/立即运行/删除 = 主面详情里那几个既有动作**（同一个函数，不是新实现）；
                             **编辑** → 打开既有草稿详情并预填（我们的映射；官方「编辑」打开什么未采到）；
                             **分享** → **本工程没有对应入口** ⇒ 只渲染菜单项、不挂 onSelect（如实标未实测，不自造）。 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="已安排任务操作"
                            className="codex-panel__icon-button codex-panel__page-row-action"
                            type="button"
                          >
                            <CodexEllipsis size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="codex-panel__row-menu" sideOffset={4}>
                          {/* [task-61] 暂停态第 1 条的**官方用词是「继续」**（task-59 ④ 实测：暂停后再开菜单，
                              第一条由「暂停」变成「继续」；其余 4 条不变）—— 原先写成「恢复」是错的。 */}
                          <DropdownMenuItem
                            icon={<CodexStop size={14} />}
                            onSelect={() => togglePause(task.id)}
                          >
                            {task.status === "PAUSED" ? "继续" : "暂停"}
                          </DropdownMenuItem>
                          <DropdownMenuItem icon={<CodexClock size={14} />} onSelect={() => runNow(task.id)}>
                            立即运行
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            icon={<CodexPencil size={14} />}
                            onSelect={() => setDraftName(task.name)}
                          >
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem icon={<CodexLink size={14} />}>分享</DropdownMenuItem>
                          <DropdownMenuItem
                            className="codex-panel__row-menu-item--danger"
                            icon={<CodexTrash size={14} />}
                            onSelect={() => remove(task.id)}
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </PanelPortal>

        <aside className="cx-split__detail">
          {/* [task-71] 草稿分支已挪进官方对话框（右下 {dialog}）；这里只剩「选中详情 / hero」两支，
              选中态行为与渲染都**没动**（behave 有覆盖）。 */}
          {selected ? (
            /* ★ task-75：官方选中已排任务时，主面**不是**详情卡片，而是**该任务的运行会话**：
               左对话流（用户消息）+ 右摘要面板。这是**同一路由内的状态切换** —— 官方实测
               `location.href` 不变、`history.length` 仍为 1（docs/RECON-TASK69-SELECTED-STATE.md §A）
               ⇒ 所以这里只是条件渲染，**没有新路由、没有跳转、不压 history**。
               前身 `cx-detail__*` 详情面板（状态/频率/下次运行/上次运行/来自/提示词 + 三个按钮）
               是本工程私有设计，已按本轮任务换成官方结构。
               官方分栏：`._MainContentFrame_` 935.33×716 @340.67,96（column）→ 唯一子节点是 row。 */
            <div className="cx-run" data-scheduled-run="">
              <div className="cx-run__row">
                <div className="cx-run__stream">
                  <div className="cx-run__scroll">
                    {/* 转录列：宽度/居中与 /c/:id 同一条规则口径（--cx-thread-column 768） */}
                    <div className="cx-run__column">
                      {/* ★ task-89：居中日期分隔（在**当天第一条消息之前**）。
                          官方逐值（RECON-TASK80-BATCH3「目标 2」）：容器 `div.flex.justify-center.py-4`
                          440.33,128 736×52（padding 16px 0）、`time` 778.13,144 60.42×20。
                          ★ 官方**没有 hr / 伪元素 / 两侧渐变线**（hr 计数 0）⇒ 这里也不加横线。
                          ⚠️ 出现条件未实测（官方那次只有一个日期）⇒ 按本工程口径「有消息就渲染一条」。 */}
                      {runDateLabel ? (
                        <div className="cx-run__date-row">
                          <time className="cx-run__date" dateTime={runDateLabel.iso}>
                            <span className="cx-run__date-today">今天</span> {runDateLabel.clock}
                          </time>
                        </div>
                      ) : null}
                      {/* 消息列表 gap 12px 由 .cx-messages 给（与 /c/:id 同一条规则）；
                          段落间距 20px 由 markdown 规则给（Message 复用）——**这里不要自己加 gap**。 */}
                      <div className="cx-messages">
                        {runMessage ? <Message message={runMessage} /> : null}
                        {/* task-89：输入区发出去的内容 = 本地回声（见 onRunSend 注释），不伪造助手回复。 */}
                        {followUps.map((text, index) => (
                          <Message
                            key={`scheduled-run-followup-${index}`}
                            message={{
                              id: `scheduled-run-followup-${index}`,
                              conversationId: `scheduled-${selected?.id ?? "unknown"}`,
                              role: "user",
                              content: text,
                              createdAt: new Date().toISOString(),
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 回到底部浮钮（audit #69）——类名/几何/aria 与
                      src/chat/ChatConversation.tsx:253-263 **同源**：32×32、贴底时 opacity 0。
                      ⚠️ 本页**没有**抽组件（task-75 的「方案 b」）：抽出去要动 chat 侧并重验 /c/:id 的
                      rect/aria，本轮预算下按同一 aria/几何在此重画 ⇒ **改一处必须改两处**，
                      同源出处 = src/chat/chat.css 的 .cx-thread__to-bottom(-anchor)。 */}
                  <div className="cx-thread__to-bottom-anchor cx-run__to-bottom-anchor">
                    <button
                      aria-label="滚动到底部"
                      className="cx-thread__to-bottom"
                      data-visible="false"
                      type="button"
                    >
                      <CodexScrollToBottom size={20} />
                    </button>
                  </div>

                  {/* ★ task-89：运行会话的**输入区**（官方有、我们原先没有）。
                      官方逐层（RECON-TASK80-BATCH3「目标 1」，同一份读数也在 task-80 的 JSON 里）：
                        root    `_ComposerLayoutRoot_` 440.33,**698** 736×**98**  bg **rgb(54,54,54)**
                        body    `_ComposerLayoutBody_` 440.33,698 736×98  position relative  **z-index 10**
                        footer  `_ComposerLayoutFooter_` 440.33,712 736×**76**  grid  gap `0 5px`  padding `0 8px`
                        input   `_ComposerLayoutInput_` 440.33,712 736×**44**  margin-bottom 4
                        editor  `.ProseMirror` 452.33,712 712×**44**  14px/20px  占位「**与 Focus 协作**」
                      我们**复用** `src/chat/Composer.tsx`（`mode="conversation"`）—— 它的盒子/页脚/编辑器
                      与上面这些官方层**同构**（chat.css 的 .cx-composer 就是 _ComposerLayoutBody_ 的映射），
                      且「贴底 + 浮在会话流之上」在 chat 侧已实现（.cx-composer-column）。
                      ⚠️ 差异一处、已登记：官方那层是 `position: relative; z-index: 10`（浮层），
                      我们放在流的末尾（与 /c/:id 同一口径）；像素位置相同、层叠机制不同。
                      ⚠️ 官方截图里的 `+` 按钮 / 「请求批准」chip / 模型选择器「5.6 Terra ⌄」/ 圆形发送钮
                      **rect 与 computed 本轮未采到** ⇒ 只按截图定性；这些控件由 Composer 自身的既有组件
                      （CodexPlusLg / PermissionMenuChip / ModelPickerChip / CodexSend）渲染，
                      **不新编数值**。 */}
                  <div className="cx-run__composer" data-run-composer="">
                    <div className="cx-run__column">
                      <Composer
                        mode="conversation"
                        onSend={onRunSend}
                        onStop={() => {}}
                        placeholder="与 Focus 协作"
                        selection={composerSelection}
                        status="idle"
                      />
                    </div>
                  </div>
                </div>

                {/* 右：摘要面板（RECON-TASK69 §A5 逐值）。
                    官方 x=1328 > 视口 1280 ⇒ 官方在本窗口下**被裁在视口外**（但 DOM 里在）；
                    我们按官方几何实现内部结构（240 宽 / padding 10px 0 / gap 8px / 分区标题「定时任务」
                    13px / 摘要项 aria=打开已安排任务 208×22.4 padding 4px 0 gap 4px），
                    并让它参与布局 ⇒ 在我们更窄的主面里**可见**（与官方"被裁"的差别已登记在 docs）。
                    ⚠️ 官方那三个 0×0 占位块（输出内容 / 创建文件或站点 / 来源）属**其它面板变体**，本轮不做。 */}
                <aside aria-label="已安排任务摘要" className="cx-run__summary">
                  <section className="cx-run__summary-section">
                    <span className="cx-run__summary-title">定时任务</span>
                    <button aria-label="打开已安排任务" className="cx-run__summary-item" type="button">
                      <span className="cx-run__summary-name">{selected.name}</span>
                      <span className="cx-run__summary-schedule">{runScheduleText}</span>
                    </button>
                  </section>
                </aside>
              </div>
            </div>
          ) : (
            /* [task-61] 官方**两态共用同一个 hero**：
               · 空态（task-44 采到的 official-rail-scheduled.json：main.first.text =
                 「🕗 安排任务 ChatGPT 可以帮你处理持续性任务，让你不必亲自动手。 新建任务」）；
               · 「已排任务但未选中」（task-59 ① 空选中态，四件与上面**逐字相同**，
                 rect 见 docs/RECON-TASK59-BATCH2.md）。
               ⇒ 抽成 scheduledHero 两处共用，避免两套 hero 漂移。
               ★ 官方那句「选择一个已安排的任务进行查看」（i18n inbox.automations.selectScheduledTask）
                 **不在主面**：task-59 ① 的空选中态主面里没有它（很可能在右侧摘要面板）⇒
                 本任务按要求先不放在主面，归后续那批一起做。 */
            scheduledHero
          )}
        </aside>
      </div>

      {dialog}
    </div>
  );
}
