import type { ComponentType } from "react";

import {
  CodexBarChart,
  CodexFolder,
  CodexGearLg,
  type CodexIconProps,
  CodexPersonGroup,
  CodexRailHome,
  CodexRailHomeActive,
  CodexRailScheduled,
  CodexSettingsSkills,
  CodexShieldCheck,
  CodexTerminalShield,
  CodexWrench,
} from "@/icons";

export interface RailItem {
  id: string;
  label: string;
  /** 目的地（导轨上每一条都是跳转，没有菜单型条目了 —— 见 2026-10-15 的说明） */
  to: string;
  /** 常态图标 */
  icon: ComponentType<CodexIconProps>;
  /** 选中态图标（官方为填充变体，如 CodexRailHomeActive） */
  iconActive?: ComponentType<CodexIconProps>;
  /**
   * 额外算作「当前条目」的路径前缀。
   * 用途：设置齿轮的 `to` 是 `/system/settings`（官方口径的入口，服务端再 302 到 /settings），
   * 而「控件库」这类**设置里的窗口**（/controls）压根不在 `/settings` 前缀下，
   * 两条路径上齿轮都该亮 —— 不补这层的话，导轨是主导航之后
   * 「人在设置里、设置按钮却不亮」会很显眼。
   */
  alsoActiveOn?: string[];
}

/**
 * 导轨条目 —— **顺序与条目数按参考端实测**。
 *
 * 出处 captures/tree-rail.json（DOM）+ captures/blocks-sidebar.json（几何）+ 截图文字
 *   [8,52]  首页
 *   [8,96]  定时任务
 *   [8,140] 插件
 *   [8,184] 探索
 *   [14,228 24×1] 分隔线
 *   [8,237] 代码审查
 *   [8,772] 底部「个人资料」（36×36，w-9）
 * 图标出处 evidence/assets/runtime-icon-names.json 的运行时实测映射：
 *   首页 home-light-20 / 定时任务 clock-light-20 / 插件 plugin-light-20 /
 *   探索 ellipsis-horizontal-light-20（带 popover）/ 代码审查 图像遮罩变体
 *
 * ★ 2026-10-15（用户：「不要『探索』，全部移入左侧栏」）：
 *   官方那条「探索」是 **popover 菜单**（i18n `sidebarCustomization.moreMenu`，
 *   `<Route path="/explore" element={<Navigate to="/" replace/>}/>` 也证明官方 /explore 只是重定向）。
 *   本工程此前照抄了这个菜单，并把菜单条目做成可拖到导轨上的固定项；用户现在要求**去掉菜单本身**、
 *   把目的地**全部常驻左侧导轨** —— 于是：
 *     · `RAIL_PRIMARY_ITEMS` 只剩「首页 / 任务」两条（官方主导轨里本工程保留的两条）；
 *     · 原来的「探索」菜单条目整体搬进 `RAIL_SECONDARY_ITEMS`（分隔线之后那一组），
 *       每条都是普通跳转按钮，**不再有 menu / 拖拽 / 固定**这套机制（use-rail-pinned.ts 已删）。
 *   图标口径不变（用户要求「图标自行选择，但不要重复、要最对应的」）：与首页 / 任务 / 设置
 *   三枚不重合，逐条取语义最近的一枚。
 */
export const RAIL_PRIMARY_ITEMS: RailItem[] = [
  { id: "home", label: "首页", to: "/new", icon: CodexRailHome, iconActive: CodexRailHomeActive },
  { id: "tasks", label: "任务", to: "/function/tasks", icon: CodexRailScheduled },
  /**
   * ★ 2026-10-15（产品重排）：审批是**待办**而不是配置 ⇒ 从设置搬到导轨，与「任务」同级。
   *   设置里只剩策略（临时自动放行 / 拦截规则），见 settings/panes/approvals.tsx。
   */
  { id: "approvals", label: "审批", to: "/approvals", icon: CodexShieldCheck },
];

/**
 * 分隔线之后的一组。
 *
 * 2026-10-15：原来这里是「发现」→ /function/findings；用户判定**发现页整个项目不需要**
 * （发现按任务看：任务页的「发现」视图），所以这一组清空 ——
 * 分隔线由 SidebarRail 按"有没有内容"决定画不画。
 *
 * ★ 同日第二轮：这一组**接收原来「探索」菜单的全部目的地**（用户：「不要『探索』，
 *   全部移入左侧栏」）。「任务」本来就在主导轨上（`RAIL_PRIMARY_ITEMS`），不再重复；
 *   LLM / MCP / 同步 / 审批策略此前已并入设置，不再占导轨。
 *   顺序沿用原菜单顺序，图标也沿用（用户此前逐条选定、彼此不重复）：
 *     流量 BarChart · Agent PersonGroup · 工具 Wrench · 技能 SettingsSkills ·
 *     工作区 Folder · 内网会话 TerminalShield
 */
export const RAIL_SECONDARY_ITEMS: RailItem[] = [
  { id: "traffic", label: "流量", to: "/function/traffic", icon: CodexBarChart },
  { id: "agents", label: "Agent", to: "/system/agents", icon: CodexPersonGroup },
  { id: "tools", label: "工具", to: "/system/tools", icon: CodexWrench },
  { id: "skills", label: "技能", to: "/system/skills", icon: CodexSettingsSkills },
  { id: "workspace", label: "工作区", to: "/function/workspace", icon: CodexFolder },
  { id: "intranet", label: "内网会话", to: "/intranet", icon: CodexTerminalShield },
];

/**
 * 底部贴底的一组。
 *
 * ⚠️ 官方底部是**齿轮 = 设置**，跳 `/settings`（Lead 实机比对 ref-01-chat-home.png）。
 * 早先写成「个人资料菜单 → /account」是错的：**官方没有 account 页**，
 * 而且 `/account` 在本工程也没有路由，点了会被 NotFound 弹回 /new。
 */
export const RAIL_BOTTOM_ITEMS: RailItem[] = [
  {
    id: "settings",
    label: "设置",
    to: "/system/settings",
    icon: CodexGearLg,
    alsoActiveOn: ["/settings", "/controls"],
  },
];
