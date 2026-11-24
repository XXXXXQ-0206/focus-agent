/**
 * 应用菜单定义（文件 / 编辑 / 视图 / 帮助）。
 *
 * 文案、快捷键、条目数、分隔线位置**逐条来自参考端实测**：
 *   captures/views-app-menu-{file,edit,view,help}.json 的 `[role=menuitem]` 与
 *   `[role=separator]` 元素序列；SPEC.md §5 的文案表。
 *
 * 尺寸自验证（用「28×N + 16.5×S + 8 = 菜单高」反解，N=条目数、S=分隔线数）：
 *   文件 28×7 + 16.5×3 + 8 = 253.5   ← 实测 253.5 ✓
 *   编辑 28×8 + 16.5×3 + 8 = 281.5   ← 实测 281.5 ✓
 *   视图 28×16 + 16.5×5 + 8 = 538.5  ← 实测 538.5 ✓
 *   帮助 28×10 + 16.5×3 + 8 = 337.5  ← 实测 337.5 ✓
 * （每条 28 = 12px 字号 × 1.5 行高 18 + 上下各 5px padding；每条分隔线 16.5 = 0.5px 线 + 上下各 8px margin；8 = 容器 padding 4px×2）
 * 这同时独立验证了 SPEC §5 的「文件 220×254 / 编辑 220×282 / 视图 300×539 / 帮助 220×338」。
 *
 * ⚠️ 2026-10-15：本文件曾随 AppMenuBar 一起被误删（当时把「Windows 自带标题栏」与
 *    「应用自绘的这条菜单栏」看串了），现已按上游源码 **逐字节恢复**（桌面端当时的构建产物
 *    亦可互证）。真正要关掉的 Windows 标题栏改在 desktop/main.js 里做，见那里的注释。
 */
import { desktop } from "./desktop-bridge";

export type AppMenuId = "file" | "edit" | "view" | "help";

export interface AppMenuItem {
  type?: "item";
  id: string;
  label: string;
  /** 右对齐的快捷键提示（官方是文本，不是 kbd 元素） */
  accelerator?: string;
  disabled?: boolean;
  /** 官方「浏览器」条目右侧带 chevron（子菜单触发项） */
  submenu?: boolean;
  run?: () => void;
}

export interface AppMenuSeparator {
  type: "separator";
}

export interface AppMenu {
  id: AppMenuId;
  label: string;
  /** 菜单宽度；实测 文件 220 / 编辑 220 / 视图 **300** / 帮助 220 */
  width: number;
  items: Array<AppMenuItem | AppMenuSeparator>;
}

const sep: AppMenuSeparator = { type: "separator" };

export const APP_MENUS: AppMenu[] = [
  {
    id: "file",
    label: "文件",
    width: 220,
    items: [
      { id: "new-window", label: "新建窗口", run: () => desktop.newWindow() },
      { id: "new-chat", label: "新聊天", accelerator: "Ctrl+N", run: () => desktop.newChat() },
      {
        id: "new-ephemeral-chat",
        label: "新建临时聊天",
        accelerator: "Ctrl+Shift+N",
        run: () => desktop.newChat(),
      },
      sep,
      { id: "open-folder", label: "打开文件夹", accelerator: "Ctrl+O", run: () => desktop.openFolder() },
      sep,
      { id: "close", label: "关闭", accelerator: "Ctrl+W", run: () => desktop.close() },
      sep,
      { id: "logout", label: "退出登录", run: () => desktop.logout() },
      { id: "quit", label: "退出 ChatGPT", accelerator: "Ctrl+Q", run: () => desktop.quit() },
    ],
  },
  {
    id: "edit",
    label: "编辑",
    width: 220,
    items: [
      { id: "undo", label: "撤销", accelerator: "Ctrl+Z", run: () => desktop.edit("undo") },
      { id: "redo", label: "重做", accelerator: "Ctrl+Y", run: () => desktop.edit("redo") },
      sep,
      { id: "cut", label: "剪切", accelerator: "Ctrl+X", run: () => desktop.edit("cut") },
      { id: "copy", label: "复制", accelerator: "Ctrl+C", run: () => desktop.edit("copy") },
      { id: "paste", label: "粘贴", accelerator: "Ctrl+V", run: () => desktop.edit("paste") },
      { id: "delete", label: "删除", run: () => desktop.edit("delete") },
      sep,
      { id: "select-all", label: "全选", accelerator: "Ctrl+A", run: () => desktop.edit("selectAll") },
      sep,
      { id: "settings", label: "设置", accelerator: "Ctrl+,", run: () => desktop.openSettings() },
    ],
  },
  {
    id: "view",
    label: "视图",
    width: 300,
    items: [
      {
        id: "toggle-sidebar",
        label: "显示/隐藏侧边栏",
        accelerator: "Ctrl+Shift+S",
        run: () => desktop.toggleSidebar(),
      },
      {
        id: "toggle-bottom-panel",
        label: "显示/隐藏底部面板",
        accelerator: "Ctrl+J",
        run: () => desktop.toggleBottomPanel(),
      },
      { id: "toggle-pinned-summary", label: "切换置顶摘要", run: () => desktop.togglePinnedSummary() },
      { id: "open-terminal", label: "打开终端", accelerator: "Ctrl+`", run: () => desktop.openTerminal() },
      {
        id: "toggle-nav-panel",
        label: "显示/隐藏导航面板",
        accelerator: "Ctrl+Shift+E",
        run: () => desktop.toggleNavPanel(),
      },
      {
        id: "switch-chat-tabs",
        label: "Switch between Chat and tabs",
        accelerator: "Alt+Ctrl+B",
        run: () => desktop.switchChatTabs(),
      },
      sep,
      { id: "browser", label: "浏览器", submenu: true, run: () => desktop.openBrowser() },
      sep,
      { id: "find", label: "查找", accelerator: "Ctrl+F", run: () => desktop.find() },
      sep,
      {
        id: "prev-chat",
        label: "上一个聊天",
        accelerator: "Ctrl+Shift+[",
        run: () => desktop.previousChat(),
      },
      { id: "next-chat", label: "下一个聊天", accelerator: "Ctrl+Shift+]", run: () => desktop.nextChat() },
      { id: "back", label: "返回", accelerator: "Ctrl+[", run: () => desktop.historyBack() },
      { id: "forward", label: "前进", run: () => desktop.historyForward() },
      sep,
      { id: "zoom-in", label: "放大", accelerator: "Ctrl+Shift+=", run: () => desktop.zoomIn() },
      { id: "zoom-out", label: "缩小", accelerator: "Ctrl+-", run: () => desktop.zoomOut() },
      { id: "zoom-reset", label: "实际大小", accelerator: "Ctrl+0", run: () => desktop.zoomReset() },
      sep,
      { id: "fullscreen", label: "切换全屏", accelerator: "F11", run: () => desktop.toggleFullScreen() },
    ],
  },
  {
    id: "help",
    label: "帮助",
    width: 220,
    items: [
      { id: "docs", label: "文档", run: () => desktop.openDocs() },
      { id: "shortcuts", label: "显示键盘快捷键", accelerator: "Ctrl+/", run: () => desktop.showShortcuts() },
      { id: "whats-new", label: "新功能", run: () => desktop.openWhatsNew() },
      sep,
      { id: "troubleshooting", label: "故障排除", run: () => desktop.openTroubleshooting() },
      { id: "status", label: "系统状态", run: () => desktop.openStatus() },
      { id: "feedback", label: "反馈", run: () => desktop.openFeedback() },
      sep,
      { id: "task-manager", label: "任务管理器", run: () => desktop.openTaskManager() },
      { id: "perf-trace", label: "开始性能跟踪", run: () => desktop.togglePerfTrace() },
      sep,
      { id: "check-updates", label: "检查更新…", run: () => desktop.checkUpdates() },
      { id: "about", label: "关于 ChatGPT", run: () => desktop.openAbout() },
    ],
  },
];
