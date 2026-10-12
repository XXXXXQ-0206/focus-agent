import {
  Activity,
  Bot,
  Brain,
  Bug,
  ClipboardList,
  FolderOpen,
  FolderSync,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Network,
  Plug,
  Radar,
  Radio,
  ScrollText,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/**
 * 侧边栏（Codex 式外壳）——只留 agent 相关入口：
 *   工作区：对话 / 任务 / 发现 / 内网（渗透作战面）
 *   底部：设置 —— 其余平台面板（仪表盘、资产、资产同步、工作空间、流量、工具执行、
 *         LLM 录制、日志、LLM/Agent/MCP/Skill/工具/拦截规则/审批）全部收进设置页，
 *         入口见 /system/settings 的「面板」卡片。
 */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "工作区",
    items: [
      { id: "chat", title: "对话", url: "/chat", icon: MessageSquare },
      { id: "tasks", title: "任务", url: "/function/tasks", icon: Target },
      { id: "findings", title: "发现", url: "/function/findings", icon: Bug },
      { id: "intranet", title: "内网", url: "/intranet", icon: Radar },
    ],
  },
  {
    id: 2,
    label: "设置",
    items: [{ id: "settings", title: "设置", url: "/system/settings", icon: Settings2 }],
  },
];

/** 收进设置页的平台面板入口（侧边栏不再直接挂）。 */
export const settingsPanelItems: Array<{ id: string; title: string; url: string; icon: LucideIcon }> = [
  { id: "dashboard", title: "仪表盘", url: "/dashboard", icon: LayoutDashboard },
  { id: "traffic", title: "流量", url: "/function/traffic", icon: Activity },
  { id: "commands", title: "工具执行", url: "/function/commands", icon: Terminal },
  { id: "llm-records", title: "LLM 录制", url: "/function/llm-records", icon: Radio },
  { id: "assets", title: "资产", url: "/function/assets", icon: Network },
  { id: "sync", title: "资产同步", url: "/function/sync", icon: FolderSync },
  { id: "workspace", title: "工作空间", url: "/function/workspace", icon: FolderOpen },
  { id: "llm", title: "LLM", url: "/system/llm", icon: Brain },
  { id: "agents", title: "Agent", url: "/system/agents", icon: Bot },
  { id: "mcp", title: "MCP", url: "/system/mcp", icon: Plug },
  { id: "skills", title: "Skill", url: "/system/skills", icon: Sparkles },
  { id: "tools", title: "工具", url: "/system/tools", icon: Wrench },
  { id: "intercept", title: "拦截规则", url: "/system/intercept", icon: ShieldAlert },
  { id: "approvals", title: "审批记录", url: "/system/intercept/approvals", icon: ClipboardList },
  { id: "logs", title: "日志", url: "/system/logs", icon: ScrollText },
];
