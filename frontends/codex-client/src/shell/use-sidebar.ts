import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { clamp } from "@/lib/utils";

export type SidebarState = "expanded" | "collapsed";

const WIDTH_KEY = "codex.sidebar.width";
const STATE_KEY = "codex.sidebar.state";

/**
 * 面板宽度区间。
 * 出处：官方 CSS `--spacing-token-sidebar: clamp(240px, var(--codex-sidebar-preferred-width,275px),
 * min(520px, calc(100vw - 320px)))`（captures/css-pretty/shell-shared.css:2957）
 * → 下限 240、上限 min(520, 100vw−320)。
 */
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 520;
/** 参考端实测默认宽度 288（SPEC §3 面板 52,44 **288**×768） */
export const SIDEBAR_DEFAULT_WIDTH = 288;
/** 导轨宽度（SPEC §3 导轨 52）—— 收起位移的补偿量，见 sidebar-panel.css */
export const SIDEBAR_RAIL_WIDTH = 52;
/**
 * 收起后主内容面的左内缩。
 *
 * 官方口径：主表面 `_PageSurface_` 的 `inset-inline-start` 是**导轨宽**
 * （shell-initial.css:3182），主内容面在它内部再按**左栏宽度**
 * （`--app-shell-left-panel-width` = `--app-shell-animated-left-panel-width`，
 * shell-initial.css:3125）内缩。面板收起时左栏宽度动画到 0 → 主内容面回到导轨右缘。
 * 所以收起态的让位是 **0**，不是 24。
 * （旧值 24px 是 task-4 的内部约定，无官方出处，会在导轨与内容面之间留一条 24px 外壳底色空隙。）
 */
export const SIDEBAR_COLLAPSED_INSET = 0;
/**
 * 窄窗口阈值 = **767.98px**（即 <768px）。
 *
 * 出处（官方唯一的响应式断点）：
 *   `@media not all and (width>=768px)` → `[data-app-shell-responsive-sidebar=true]`
 *   把 `--app-shell-left-panel-width` 压成 0 并 `display:none` 掉左栏
 *   （官方CSS shell-initial.css:3130-3136）。
 * 旧值 899px 是 task-4 的内部约定，**无官方出处**，已按 Lead 裁决作废。
 */
export const SIDEBAR_NARROW_QUERY = "(max-width: 767.98px)";

/**
 * 面板状态（宽度 / 展开收起 / 拖拽中）。
 *
 * 语义与参考端一致：
 *  - **宽度恒定**，收起时整体平移出屏（平移量 = 自身宽度 + 导轨宽，见 sidebar-panel.css），
 *    这样面板右缘正好落在 x=0，**不会**把内容残留在 52px 导轨区域；
 *  - 主内容左内边距同步做 宽度 ↔ 0；
 *  - 窄窗口（< 768px）自动收起，这是「强制」态，不改写用户自己的偏好。
 *
 * 实现用模块级外部 store（useSyncExternalStore）：这样菜单栏、导轨、面板、
 * 主表面任意一处调用 useSidebar() 拿到的是同一份状态，不需要 Provider 包裹，
 * 外部误用时也不会抛错。
 */

type Listener = () => void;

interface Snapshot {
  /** 用户偏好 */
  state: SidebarState;
  /** 是否处在窄窗口强制收起态 */
  narrow: boolean;
  /** 生效态（用户偏好 ∩ 窄窗口） */
  effective: SidebarState;
  collapsed: boolean;
  /** 面板宽度（px） */
  width: number;
  /** 是否正在拖拽 resizer（拖拽期间禁 transition） */
  resizing: boolean;
  /** 主内容应让出的内缩（px） */
  inset: number;
}

const listeners = new Set<Listener>();

function readState(): SidebarState {
  if (typeof window === "undefined") return "expanded";
  return window.localStorage.getItem(STATE_KEY) === "collapsed" ? "collapsed" : "expanded";
}

function readWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = Number(window.localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(raw) && raw > 0
    ? clamp(raw, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
    : SIDEBAR_DEFAULT_WIDTH;
}

function readNarrow(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(SIDEBAR_NARROW_QUERY).matches;
}

let rawState: SidebarState = readState();
let rawWidth = readWidth();
let narrow = readNarrow();
let resizing = false;
let snapshot: Snapshot = build();

function build(): Snapshot {
  const effective: SidebarState = narrow ? "collapsed" : rawState;
  const collapsed = effective === "collapsed";
  return {
    state: rawState,
    narrow,
    effective,
    collapsed,
    width: rawWidth,
    resizing,
    inset: collapsed ? SIDEBAR_COLLAPSED_INSET : rawWidth,
  };
}

function emit() {
  snapshot = build();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.sidebarState = snapshot.effective;
    document.documentElement.dataset.sidebarNarrow = String(snapshot.narrow);
  }
  for (const l of listeners) l();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => snapshot;

/**
 * 官方 `toggleSidebar` 命令的键位（app-initial-…js 命令表）：
 *   browser:  `{ key: "CmdOrCtrl+Shift+S" }`
 *   electron: `{ key: "CmdOrCtrl+Shift+S" }, { key: "CmdOrCtrl+B" }`
 * 即 **Electron 里 Ctrl+B 与 Ctrl+Shift+S 都能收起侧栏**。
 * 官方 composer 的 keymap 也显式把光标空选区处的 Ctrl+B 让给 toggleSidebar
 * （app-primary-…js 的 act()：`yy(n10,'CmdOrCtrl+B') && keybindings('toggleSidebar')`）。
 *
 * ⚠️ 2026-10-15：**键盘触发搬去了设置里的命令系统**（src/settings/commands.ts 的
 * `toggle-sidebar`，默认 Ctrl+B、固定别名 Ctrl+Shift+S，"可编辑区里有选中文字时让路给
 * 浏览器加粗"的守卫也一起搬走）。这里只留事件入口，避免两处同时监听同一组键位导致
 * 「按一下切两次」。
 */

if (typeof window !== "undefined") {
  snapshot = build();
  // 首帧两个属性都要打。此前只打了 sidebar-state，sidebar-narrow 要等第一次 emit() 才出现，
  // 导致「窄窗口属性缺失」的不对称（行为测试 sb.narrow.attr-consistency 抓到的就是这个）。
  document.documentElement.dataset.sidebarState = snapshot.effective;
  document.documentElement.dataset.sidebarNarrow = String(snapshot.narrow);
  const mql = window.matchMedia(SIDEBAR_NARROW_QUERY);
  const onNarrow = (e: MediaQueryListEvent) => {
    if (narrow === e.matches) return;
    narrow = e.matches;
    emit();
  };
  mql.addEventListener("change", onNarrow);

  // 收起/展开的唯一入口。三条来源共用它：
  //   1) 顶栏「隐藏侧边栏」按钮（useSidebar().toggle）
  //   2) 视图菜单「显示/隐藏侧边栏」（desktop-bridge → codex:toggle-sidebar）
  //   3) 键盘 Ctrl+B / Ctrl+Shift+S —— 由设置里的命令系统派发（见上面的 ⚠️ 说明）
  window.addEventListener("codex:toggle-sidebar", () => {
    toggleSidebar();
  });
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, rawState);
  window.localStorage.setItem(WIDTH_KEY, String(rawWidth));
}

export function toggleSidebar() {
  rawState = rawState === "expanded" ? "collapsed" : "expanded";
  persist();
  emit();
}

export function setSidebarState(state: SidebarState) {
  if (rawState === state) return;
  rawState = state;
  persist();
  emit();
}

export function setSidebarWidth(width: number) {
  const next = clamp(Math.round(width), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  if (next === rawWidth) return;
  rawWidth = next;
  persist();
  emit();
}

export function resetSidebarWidth() {
  setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
}

export function setSidebarResizing(value: boolean) {
  if (resizing === value) return;
  resizing = value;
  emit();
}

/** 面板宽度与展开状态。展开/收起/宽度为全局共享状态。 */
export function useSidebar() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => toggleSidebar(), []);
  const expand = useCallback(() => setSidebarState("expanded"), []);

  const value = useMemo(
    () => ({
      ...snap,
      toggle,
      expand,
      setWidth: setSidebarWidth,
      resetWidth: resetSidebarWidth,
      setResizing: setSidebarResizing,
      setState: setSidebarState,
      minWidth: SIDEBAR_MIN_WIDTH,
      maxWidth: SIDEBAR_MAX_WIDTH,
      railWidth: SIDEBAR_RAIL_WIDTH,
    }),
    [snap, toggle, expand],
  );

  useEffect(() => {
    // 首次挂载把 dataset 打上（SSR/首帧兜底）。
    // ⚠️ 两个属性要成对写 —— 只写 state 会让 narrow 在首次挂载时缺失（与模块级初始化保持一致）。
    document.documentElement.dataset.sidebarState = snap.effective;
    document.documentElement.dataset.sidebarNarrow = String(snap.narrow);
  }, [snap.effective, snap.narrow]);

  return value;
}
