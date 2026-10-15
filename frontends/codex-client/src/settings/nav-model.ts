import { Bot, Cpu, Network, RefreshCw, Search, Server, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { ComponentType } from "react";

import {
  CodexArchive,
  CodexBrowser,
  CodexInfo,
  CodexSettingsConfig,
  CodexSettingsPlugins,
  CodexSettingsShortcuts,
} from "@/icons";

/**
 * 设置导航数据模型（**设置页与外壳的共享契约**）。
 *
 * 侧栏面板归 cx-shell；本文件只提供数据与选择器，shell 直接渲染即可：
 *   import { SETTINGS_NAV_GROUPS, findSettingsSection } from "@/settings/nav-model";
 *
 * ★ 条目、顺序、分组、图标名**逐条来自 docs/SPEC-SETTINGS.md §3**（3 组 18 条，全量实测）：
 *   个人 9 · 集成 3 · 编码 6；分组标题文案 = settings.nav.heading.personal|integrations|coding。
 * 本工程在官方 18 条之外**追加一个独立分组「还原工程（附加）」**（自定义 API；另有
 * 深链页「关于」，见 hiddenFromNav），它们不属于官方设置面 —— SPEC §6 对账表与 §7.4 已登记，
 * 绝不混进官方分组冒充，左栏用一条发丝分隔线 + 「附加」分组名与官方 3 组视觉分开
 * （FIDELITY-AUDIT #88 的用户侧要求：自定义 API 必须保留但不得混进官方 18 项）。
 *
 * 几何依据（SPEC §2 实测，@1280×816）：
 *   搜索框 272×36 药丸（x=60）→ 组标题 30 高（14/500/21）→ 组内 gap 4 → 条目列表 gap 1
 *   条目 30 高 · 圆角 12.5 · 14/400/21 · 图标 x=68（16×16）· 文字 x=92 · 步进 31px
 *   选中底 rgba(255,255,255,.08)；首条目 y=178 = 滚动区顶 140 + 内距 4 + 标题 30 + gap 4
 *
 * 某个分区自己的页面由 `./panes` 的 SETTINGS_PANES 提供（C2 组负责 15 页）。
 */

/** 官方图标组件的公共 props（见 src/icons/codex-icon-props.ts）；lucide 图标同样满足这个形状 */
export type SettingsNavIcon = ComponentType<{ className?: string; size?: number }>;

export interface SettingsNavItem {
  /** 本工程的路由 id（= /settings/:slug，也是 panes/SETTINGS_PANES 的 key） */
  slug: string;
  /** 官方 slug（SPEC §3「官方 slug」列）；附加项没有官方 slug */
  officialSlug?: string;
  /** 官方原文（SPEC §3「条目原文」列：中文取官方 zh-CN 语言包，未汉化的保留英文） */
  label: string;
  icon: SettingsNavIcon;
  /** 图标出处：官方图标名 / 参考端运行时实拍 / 未解析说明（SPEC §3 + §8.6） */
  iconSource: string;
  /** 供设置页 h1 下的一行说明（可选；官方内容页没有这一行，属于本工程补充） */
  description?: string;
  /** true = 本还原工程附加项（官方没有这个分区） */
  additional?: boolean;
  /**
   * true = **只在 /settings/<slug> 深链可达，不进左栏导航**。
   *
   * 用途：「关于」——SPEC-SETTINGS §7.4「官方没有这个分区，建议降级为常规页的
   * 『打开源许可证』行，或明确标注为附加页」；参考端左栏实测只有 **3 组 18 行**
   * （FIDELITY-AUDIT #89/[C51]）。降级动作已经落地在常规页第 12 行「打开源许可证 →
   * 查看」（内容与 AboutSection 同源 about-data.ts），所以这里把导航行撤掉，
   * 页面本体与路由保留给深链/书签。
   */
  hiddenFromNav?: boolean;
  /**
   * 覆盖导航目标。默认 = `/settings/<slug>`（分区页）。
   * 用途：本工程自己加的、**不是设置分区**的落地页 —— 目前只有「控件库」（`/controls`，
   * 官方控件标本台，task-38 用户需求）。这样它能在设置左栏里出现，但不会去注册一个空分区。
   */
  to?: string;
}

export interface SettingsNavGroup {
  id: string;
  /** 分组标题（官方文案：个人 / 集成 / 编码） */
  label: string;
  items: SettingsNavItem[];
  /** true = 本还原工程附加分组 */
  additional?: boolean;
}

/**
 * 个人组 —— **常规 / 键盘快捷键 / 归档**。
 *
 * 「常规」一项里装的是用户点名的 8 行：发送快捷键 / 跟进（排队）方式 / 完成与通知 /
 * 默认打开位置 / 字体（字号 + 代码字号）/ 密度 / 主题 / 圆角 —— 全部真实生效，
 * 出处见 sections/GeneralSection.tsx 头注释。官方那条『外观』页的其余行（差异标记、
 * Dock 图标、字体平滑、减少动效、指针光标、智能标点…）与本工程原有的『键盘快捷键』页
 * 2026-10-15 第二轮修正（用户：「这些都做不了吗？」）：
 *   · 外观页里**真正接线**的三行（减少动态效果 / 字体平滑 / 使用指针光标 —— 分别写
 *     :root[data-reduced-motion|data-font-smoothing|data-pointer-cursors]，base.css 与 ui.css 都吃）
 *     搬进「常规 → 显示」；差异标记一行**没有承接**（全仓只有 store 与重置清单引用它，
 *     没有任何 diff 视图消费）⇒ 不恢复；Dock 图标是 macOS 专属、智能标点是纯文本替换，都不恢复。
 *   · 键盘快捷键**恢复**，并重做成真绑定（只列本客户端有实现的命令，改键立刻生效，
 *     见 commands.ts 与 panes/shortcuts.tsx）。
 *
 * 官方其余 6 条（导入 / Archived chats / 语音 / 配置 / 个性化 / Mini 与虚拟宠物）删除理由：
 *   导入        —— 官方从 ChatGPT/其他 AI 应用导入设置与聊天；本工程没有账号域可导
 *   Archived chats —— 官方是 ChatGPT 已归档聊天；本工程的等价物是 **ARTEX 任务归档**
 *                     （`/api/task-archives`），所以**重做**成『归档』页而不是删掉入口
 *   语音        —— 实时语音/听写；本工程没有音频采集与 STT 通道
 *   配置(agent) —— **并入「自定义 API → 智能体默认」**（用户 2026-10-15 指定）：
 *                  官方那页里本工程能承接的部分 = 模型默认参数（推理强度）
 *                  + 提示词相关（系统提示词、关于你）；审批策略/沙盒/网络访问在本客户端
 *                  **没有执行侧**（请求不落本机执行），所以不搬来这里假装，改在页内指路
 *                  （ARTEX 侧的真实审批在「审批」页与节点拦截规则里）
 *   个性化      —— **并入「自定义 API」**：自定义指令 = 系统提示词（已有），
 *                  新增「关于你（背景与偏好）」会追加进同一条 system 消息
 *   Mini 宠物   —— 与产品无关（用户点名删除）
 */
const PERSONAL_ITEMS: SettingsNavItem[] = [
  {
    slug: "general",
    officialSlug: "general-settings",
    label: "常规",
    icon: SlidersHorizontal,
    // SPEC §3 #1：#1 官方图标名「未解析」（目视 = sliders 形；官方目录候选 sliders-light-16）。
    // src/icons 里没有该组件（W3 只搬运了 15 个已解析的），这里用 lucide 的 sliders 形代用。
    iconSource:
      "未解析：目视 sliders 形，目录候选 sliders-light-16（SPEC §3 #1 / §8.6）；代用 lucide SlidersHorizontal",
    description: "发送、通知、打开位置、字体、密度、主题与圆角",
  },
  {
    slug: "archived",
    officialSlug: "archived-chats",
    label: "归档",
    icon: CodexArchive,
    iconSource:
      "未解析：目视归档盒，候选 archive-light-16（SPEC §3 #4 / §8.6）；代用官方 archive-light-16 图形（src/icons CodexArchive）",
    description: "已归档的 ARTEX 任务（恢复 / 删除）",
  },
  {
    slug: "shortcuts",
    officialSlug: "keyboard-shortcuts",
    label: "键盘快捷键",
    icon: CodexSettingsShortcuts,
    iconSource:
      "参考端运行时实拍（SPEC §3 #9；src/icons CodexSettingsShortcuts，viewBox 0 0 20 20 → 渲染 16）",
    description: "改键并立刻生效（导航 / 界面 / 调试命令）",
  },
];

/**
 * 集成组 —— **插件 / 浏览器 / 连接**。
 *   插件    重做成真实数据页：ARTEX 的 MCP 服务器（/api/mcp：添加、编辑、启停、删除、刷新工具）
 *   浏览器  2026-10-15 恢复并做成**真实页**：内置的 Playwright MCP（后端种入的 `browser`
 *           服务器，抓包开启时自动接代理 + CA）——状态/启停/工具清单/刷新都是真接口
 *   连接    真实数据页：远程连接 —— 内网会话（/api/sessions）、隧道（/api/tunnels）、
 *           凭据（/api/credentials，脱敏）＋ 指向内网会话页（/intranet）的入口
 *   电脑操控 删（**并入连接**）—— 官方是 ChatGPT 控制本机应用；本工程的等价物
 *           = 内网会话（在远程机器上执行命令/读写文件），已经由「连接」页 + 内网会话页承担
 */
const INTEGRATION_ITEMS: SettingsNavItem[] = [
  {
    slug: "plugins",
    officialSlug: "plugins-settings",
    label: "插件",
    icon: CodexSettingsPlugins,
    iconSource: "plugin-light-16（SPEC §3 #10；src/icons CodexSettingsPlugins）",
    description: "MCP 服务器（添加、编辑、启停与工具）",
  },
  {
    slug: "browser",
    officialSlug: "browser-use",
    label: "浏览器",
    icon: CodexBrowser,
    iconSource: "参考端运行时实拍，官方名未解析（SPEC §3 #12；src/icons CodexBrowser）",
    description: "Playwright 浏览器自动化（内置 MCP）",
  },
];

/**
 * 编码组（官方 6 条，**整组删除**）。
 *
 * 官方这 6 项全部是「本地编码代理」域的能力，本工程没有任何一个能落到真实动作上：
 *   钩子      没有钩子执行引擎（官方接的是 Codex 宿主生命周期）
 *   连接      官方是 ChatGPT 远程设备/SSH/WSL 控制；本工程的对应物是
 *             「ARTEX（服务端）→ 连接」（上游代理/解释器）与内网会话页
 *   代码审查  需要仓库托管与拉取请求通道
 *   Git      需要托管工作树/分支前缀/PR 指引的执行侧
 *   环境      需要本地环境脚本与工作树
 *   Worktrees 同上
 * ⇒ 留着只能是「长得像、点了没用」的假开关，按用户口径删除（git 历史里可查回）。
 * 2026-10-15 复核（用户：「这些都做不了吗？」）后仍然全部删除，逐条给出**为什么不能真做**：
 *   钩子      没有生命周期宿主（官方钩子挂在 Codex 宿主的工具调用/提交事件上）
 *   代码审查  需要仓库托管 + 拉取请求通道，ARTEX 没有
 *   Git       同上：没有工作树/分支/推送的执行侧
 *   环境      官方是"每个项目的工作树初始化/清理脚本"；本工程的对应物是 ARTEX 侧的
 *             python 解释器与工作区设置（已在「上游连接」+ 工作区页），不重复造
 *   Worktrees 依赖 Git
 *   连接(旧)  远程设备控制需要账号域与配对通道；本工程的远程连接是内网会话（已在「连接」页）
 */

/**
 * 独立附加分组（**不是官方分区**）：
 *   · 自定义 API —— 本还原工程新增（src/api 的公开接口），用户明确要求；
 *   · 关于 —— SPEC §7.4 判定「官方没有这个分区」，建议降级/标注为附加页。
 * 官方对应的「关于信息」入口是常规页第 12 行「打开源许可证」+「查看」按钮。
 */
const ARTEX_ITEMS: SettingsNavItem[] = [
  {
    /**
     * ★ 2026-10-15（用户：「把 LLM 配置 + 自定义 API 合并，做成 DeepSeek Harness 那样」）：
     *   原来这里一条「LLM 配置」（服务端档案），「还原工程（附加）」组里还有一条
     *   「自定义 API」（客户端直连）—— 两页讲的是同一件事（模型从哪来、用哪把钥匙），
     *   现在合并成一页「模型与 API」：当前生效 / 服务商 / 客户端直连 / 故障转移池。
     *   旧 slug `llm` 与 `api` 在 SettingsPage 里做重定向，书签不失效。
     */
    slug: "model-api",
    label: "模型与 API",
    icon: Cpu,
    iconSource:
      "原「探索 → LLM」页（2026-10-15 并入设置；同日与「自定义 API」合并）；lucide Cpu",
    description: "服务商、协议、密钥、高级项（思考强度 / 输出上限 / 收发模式）与故障转移池",
    additional: true,
  },
  {
    slug: "artex-agents",
    label: "Agent 运行",
    icon: Bot,
    iconSource: "ARTEX 服务端分区（非官方 Codex 分区）；lucide Bot",
    description: "约束注入、并发上限与 LLM 故障转移",
    additional: true,
  },
  {
    /*
     * 连接与流量（原「连接」+「上游连接」+「流量与证据」三页合并，2026-10-15 用户提议）。
     *
     * 合并理由：三页讲的其实是**同一条链路**的不同段落 ——
     *   浏览器/Agent 出去 → 上游代理（global_proxy）→ 目标流量被 MITM 捕获（traffic_capture）
     *   → 证据自动绑定（agent_traffic_binding）；内网那一侧则是会话 / 隧道 / 凭据；
     *   脚本运行时（python 解释器）是这条链路上被调用的本地能力。
     * 拆成三页时用户要在三个页面之间来回找（且「上游连接」「连接」两个名字还互相撞脸），
     * 现在合成一页：**代理与运行时 → 流量与证据 → 内网会话 → 隧道 → 凭据**。
     * 旧路由 /settings/artex-traffic 与 /settings/artex-connections 保留为重定向（书签不失效）。
     */
    slug: "connections",
    label: "连接与流量",
    icon: Network,
    iconSource: "ARTEX 服务端分区（非官方 Codex 分区）；lucide Network（原「上游连接」图标）",
    description: "上游代理、流量捕获、内网会话、隧道、凭据与脚本运行时",
    additional: true,
  },
  {
    slug: "sync",
    label: "同步",
    icon: RefreshCw,
    iconSource: "原「探索 → 同步」页（2026-10-15 并入设置）；lucide RefreshCw",
    description: "ScopeSentry 数据源连接（执行同步仍在该页）",
    additional: true,
  },
  {
    slug: "approvals",
    label: "审批与拦截",
    icon: ShieldCheck,
    iconSource: "原「探索 → 审批」页的策略部分（2026-10-15 并入设置）；lucide ShieldCheck",
    /**
     * 2026-10-15：官方「配置」页里的批准策略 / 沙盒 / 网络访问在本客户端**没有执行侧**
     * （本客户端只发 HTTP 请求、不落本机执行），这句说明原来挂在「模型与 API」页里，
     * 用户指出那不属于模型页 ⇒ 挪到真正干活的地方（本页）。
     */
    description:
      "临时自动放行与拦截规则（待审批队列在原页）；官网「配置」页的沙盒 / 网络访问在本客户端没有执行侧，故不在此列",
    additional: true,
  },
  {
    slug: "artex-search",
    label: "网络搜索",
    icon: Search,
    iconSource: "ARTEX 服务端分区（非官方 Codex 分区）；lucide Search",
    description: "搜索 provider、访问代理与 API Key",
    additional: true,
  },
];

const ADDITIONAL_ITEMS: SettingsNavItem[] = [
  {
    slug: "controls",
    label: "控件库",
    icon: CodexSettingsConfig,
    iconSource: "附加项，无官方图标（借官方 settings-config 形：src/icons CodexSettingsConfig）",
    description: "官方控件标本台（/controls）—— 不是设置分区，点开即离开设置页",
    additional: true,
    to: "/controls",
  },
  {
    slug: "about",
    label: "关于",
    icon: CodexInfo,
    iconSource: "附加项；图标借官方 info 形（src/icons CodexInfo，官方 info-light-16）",
    description: "版本、构建与还原工程信息（官方无此分区）",
    additional: true,
    // ★ FIDELITY-AUDIT #89 / [C51]（P1）：参考端左栏没有「关于」这一行（全量 18 行）。
    // 按 SPEC-SETTINGS §7.4 的第一档建议降级 —— 内容已在常规页「打开源许可证 → 查看」，
    // 这里只保留 /settings/about 深链，不再占左栏行位。
    hiddenFromNav: true,
  },
];

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  { id: "personal", label: "个人", items: PERSONAL_ITEMS },
  { id: "integrations", label: "集成", items: INTEGRATION_ITEMS },
  { id: "artex", label: "ARTEX（服务端）", items: ARTEX_ITEMS, additional: true },
  { id: "restored", label: "还原工程（附加）", items: ADDITIONAL_ITEMS, additional: true },
].filter((group) => group.items.length > 0);

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);

/**
 * 左栏真正渲染的分组：官方 3 组 18 条 + 「还原工程（附加）」里**保留在导航中**的项
 * （当前只有「自定义 API」）。hiddenFromNav 的项只在 SETTINGS_NAV_GROUPS 里（供
 * findSettingsSection 深链解析）。
 */
function stripHiddenFromNav(groups: SettingsNavGroup[]): SettingsNavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.hiddenFromNav) }))
    .filter((group) => group.items.length > 0);
}

export const VISIBLE_SETTINGS_NAV_GROUPS: SettingsNavGroup[] = stripHiddenFromNav(SETTINGS_NAV_GROUPS);

/** 官方 3 组 18 条（不含附加分组）—— 供对账与搜索复用 */
export const OFFICIAL_SETTINGS_NAV_ITEMS: SettingsNavItem[] = SETTINGS_NAV_GROUPS.filter(
  (group) => !group.additional,
).flatMap((group) => group.items);

export const DEFAULT_SETTINGS_SECTION = "general";

/** SPEC §3：placeholder = settings.search.placeholder「搜索」，aria-label = 「搜索设置」 */
export const SETTINGS_SEARCH_PLACEHOLDER = "搜索";
export const SETTINGS_SEARCH_ARIA_LABEL = "搜索设置";
/** SPEC §3：settings.search.noResults = 「未找到结果」 */
export const SETTINGS_SEARCH_EMPTY = "未找到结果";

export function findSettingsSection(slug: string | undefined): SettingsNavItem | undefined {
  if (!slug) return undefined;
  return SETTINGS_NAV_ITEMS.find((item) => item.slug === slug);
}

/** 模糊匹配：设置页与侧栏搜索共用同一套判定 */
export function filterSettingsNav(query: string): SettingsNavGroup[] {
  const keyword = query.trim().toLowerCase();
  const visible = stripHiddenFromNav(SETTINGS_NAV_GROUPS);
  if (!keyword) return visible;
  return visible
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, item.slug, item.officialSlug ?? "", item.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
