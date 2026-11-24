/**
 * 桌面能力桥。
 *
 * 在 Electron 里由 preload 暴露 window.codexDesktop；在普通浏览器里全部退化为
 * 原生/web 行为，保证同一份前端代码两边都能跑。**不要**在组件里直接读
 * window.codexDesktop（见 docs/ARCHITECTURE.md §5）。
 *
 * IPC 通道约定（W6 主进程按同名 action 实现）：
 *   window.codexDesktop.invoke(action, payload?) → Promise<unknown>
 */
export interface DesktopBridge {
  readonly isDesktop: boolean;
  newWindow: () => void;
  newChat: () => void;
  openFolder: () => void;
  openSettings: () => void;
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;
  togglePinnedSummary: () => void;
  toggleNavPanel: () => void;
  openTerminal: () => void;
  switchChatTabs: () => void;
  openBrowser: () => void;
  find: () => void;
  previousChat: () => void;
  nextChat: () => void;
  historyBack: () => void;
  historyForward: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  toggleFullScreen: () => void;
  close: () => void;
  quit: () => void;
  logout: () => void;
  edit: (command: string) => void;
  openDocs: () => void;
  showShortcuts: () => void;
  openWhatsNew: () => void;
  openTroubleshooting: () => void;
  openStatus: () => void;
  openFeedback: () => void;
  openTaskManager: () => void;
  togglePerfTrace: () => void;
  checkUpdates: () => void;
  openAbout: () => void;
  /**
   * 原生「选择…」对话框（Electron `dialog.showOpenDialog`）→ 绝对路径；取消返回 null。
   *
   * 只有桌面端有实现（preload → IPC `pick-path`，见 desktop/preload.js 与 desktop/main.js）；
   * 浏览器里 `window.codexDesktop` 不存在 ⇒ 直接返回 null，调用方据此降级为"页内手填"
   * （设置里的路径字段用它：值文本 + 选择，而不是裸输入框 —— 用户 2026-10-15 要求）。
   */
  pickPath: (kind?: "file" | "directory", title?: string) => Promise<string | null>;
}

declare global {
  interface Window {
    codexDesktop?: { invoke: (action: string, payload?: unknown) => Promise<unknown> };
  }
}

const invoke = (action: string, payload?: unknown) => {
  void window.codexDesktop?.invoke(action, payload);
};

/** 浏览器降级：派发应用内事件，由外壳/对话面自行响应 */
const emit = (type: string, detail?: unknown) => {
  window.dispatchEvent(new CustomEvent(type, { detail }));
};

const openExternal = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export const desktop: DesktopBridge = {
  get isDesktop() {
    return typeof window !== "undefined" && Boolean(window.codexDesktop);
  },

  newWindow: () => invoke("newWindow"),
  /**
   * `newChat` / `openSettings` / `toggleSidebar` 三个都是**渲染层自己的状态**：
   * 官方把它们实现成渲染层命令（app-initial-…js 的命令表里
   * `{ id: "toggleSidebar", browser: { defaultKeybindings: [...] }, electron: { menuTitle, defaultKeybindings } }`），
   * 主进程只负责菜单项与快捷键，真正的执行发生在渲染层。
   *
   * ⚠️ 所以这里**必须先本地生效**，不能只 invoke 等主进程回投：
   * 本工程主进程的「主 → 渲染」回投通道挂在 `windowManager.sendMessageToWebContents` 的
   * ready 队列上，而 `markWebContentsReady()` 全仓库没有任何调用点
   * （electron/windows/window-manager.ts:665 只有定义），于是所有回投消息被永久排队，
   * 实测 `window.codexDesktop.invoke("toggleSidebar")` 返回 true 但渲染层收不到任何事件
   * —— 视图菜单里点「显示/隐藏侧边栏」完全没反应。
   *
   * newChat / openSettings 是**幂等**的（重复一次只是再导航到同一路由），
   * 所以本地派发之外仍然 invoke，等回投通道修好后主进程也能同步；
   * toggleSidebar 是**非幂等**的，本地派发后**不能**再 invoke，
   * 否则回投一旦恢复就会「一按两翻」。
   */
  newChat: () => {
    emit("codex:new-chat");
    if (window.codexDesktop) invoke("newChat");
  },
  openFolder: () => invoke("openFolder"),
  openSettings: () => {
    emit("codex:open-settings");
    if (window.codexDesktop) invoke("openSettings");
  },
  toggleSidebar: () => {
    emit("codex:toggle-sidebar");
  },
  toggleBottomPanel: () => emit("codex:toggle-bottom-panel"),
  togglePinnedSummary: () => emit("codex:toggle-pinned-summary"),
  toggleNavPanel: () => emit("codex:toggle-nav-panel"),
  openTerminal: () => emit("codex:open-terminal"),
  switchChatTabs: () => emit("codex:switch-chat-tabs"),
  openBrowser: () => emit("codex:open-browser"),
  find: () => emit("codex:find"),

  previousChat: () => emit("codex:previous-chat"),
  nextChat: () => emit("codex:next-chat"),
  historyBack: () => window.history.back(),
  historyForward: () => window.history.forward(),

  zoomIn: () => invoke("zoomIn"),
  zoomOut: () => invoke("zoomOut"),
  zoomReset: () => invoke("resetZoom"),
  toggleFullScreen: () => invoke("toggleFullScreen"),
  close: () => invoke("close"),
  quit: () => invoke("quit"),
  logout: () => invoke("logout"),

  /**
   * 编辑命令。桌面端走原生 role（撤销/重做/剪切/复制/粘贴/全选），
   * 浏览器端退化为 document.execCommand —— 这是唯一在两个环境里语义一致的兜底。
   */
  edit: (command: string) => {
    if (window.codexDesktop) {
      invoke("edit", command);
      return;
    }
    try {
      document.execCommand(command);
    } catch {
      /* 浏览器不支持时静默：菜单项仍然可点 */
    }
  },

  openDocs: () => openExternal("https://developers.openai.com/codex/"),
  showShortcuts: () => emit("codex:show-shortcuts"),
  openWhatsNew: () => emit("codex:whats-new"),
  openTroubleshooting: () => emit("codex:troubleshooting"),
  openStatus: () => openExternal("https://status.openai.com/"),
  openFeedback: () => emit("codex:feedback"),
  openTaskManager: () => emit("codex:task-manager"),
  togglePerfTrace: () => emit("codex:perf-trace"),
  checkUpdates: () => emit("codex:check-updates"),
  openAbout: () => emit("codex:about"),
  pickPath: async (kind = "file", title) => {
    const bridge = typeof window === "undefined" ? undefined : window.codexDesktop;
    if (!bridge) return null;
    try {
      const result = await bridge.invoke("pick-path", { kind, title });
      return typeof result === "string" && result.length > 0 ? result : null;
    } catch {
      return null;
    }
  },
};
