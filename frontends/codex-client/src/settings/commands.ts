import { useEffect, useSyncExternalStore } from "react";

/**
 * 应用命令 + 键位绑定（设置 → 键盘快捷键 的**唯一数据源**）。
 *
 * ── 为什么是重写而不是沿用旧表 ────────────────────────────────────────────
 * 旧实现（2026-10-14 之前）是一张 34 行的**官方菜单复刻表**（撤销/重做/退出 ChatGPT…），
 * 但那些键位在本客户端里**没有任何分发器**：改了也不生效 —— 属于"长得像、点了没用"。
 * 2026-10-15 按用户口径（能做就做）重做成真系统：
 *   · 只列**本客户端真有实现**的命令（下面 COMMANDS，每条都带 run()）；
 *   · 键位可改（localStorage `codex.commands`），改完立刻生效（同一个 store 供分发器与页面读）；
 *   · 分发器 `useCommandHost()` 挂在 AppShell（Router + ThemeProvider 内侧），
 *     所以命令能真的导航、切主题、开搜索、开检查器。
 *
 * 未做：官方表里的 撤销/重做/剪切/复制/粘贴/全选（浏览器原生，不需要我们绑定）、
 * 退出/关闭窗口（Electron 外壳的职责，Web 端没有）、上一个/下一个聊天（本客户端没有会话栈）。
 * 这些**不列**，避免再出现"列表里有一半不生效"的页面。
 */

export interface CommandContext {
  navigate: (to: string) => void;
  toggleTheme: () => void;
  resolvedTheme: "light" | "dark";
}

export interface AppCommand {
  id: string;
  label: string;
  description: string;
  group: "导航" | "界面" | "调试";
  /** 默认键位（官方口径的写法：Ctrl+K / Ctrl+, / F11）；空串 = 默认不绑定 */
  defaultChord: string;
  /** 固定别名（官方给了两套键位的动作，例如收起侧栏 Ctrl+B 与 Ctrl+Shift+S） */
  aliases?: string[];
  /**
   * 额外让路守卫：返回 false 时这次按键**不触发**本命令（继续走浏览器默认行为）。
   * 用例：Ctrl+B 在可编辑区里有选中文字时是浏览器原生的"加粗"，
   * 旧实现在 use-sidebar 里写过同一条守卫，搬家时保留。
   */
  guard?: (event: KeyboardEvent) => boolean;
  run: (context: CommandContext) => void;
}

/** 可编辑区里"有非空选区" ⇒ 让路给浏览器原生快捷键（加粗等） */
function selectionInsideEditor(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return false;
  const selection = window.getSelection();
  return selection != null && !selection.isCollapsed;
}

/** 把 KeyboardEvent 归一成 "Ctrl+Shift+S" / "F11" / "Ctrl+," 这样的 chord 串 */
export function normalizeChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  const key = event.key;
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return parts.join("+");

  const map: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    " ": "Space",
    Escape: "Esc",
    Enter: "Enter",
    "+": "=",
  };
  let label = map[key] ?? key;
  if (label.length === 1 && event.shiftKey && /[a-z]/i.test(label)) label = label.toUpperCase();
  parts.push(label);
  return parts.join("+");
}

/** 宽松比较：忽略大小写与空格（"Ctrl+Shift+S" == "ctrl + shift + s"） */
export function chordEquals(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  return norm(a) === norm(b);
}

export const COMMANDS: AppCommand[] = [
  {
    id: "new-chat",
    label: "新聊天",
    description: "回到首页开始一条新对话",
    group: "导航",
    defaultChord: "Ctrl+N",
    run: (context) => context.navigate("/new"),
  },
  {
    id: "search",
    label: "搜索",
    description: "打开命令面板（任务 / 设置 / 操作）",
    group: "导航",
    defaultChord: "Ctrl+K",
    aliases: ["Ctrl+Shift+P"],
    run: () => {
      // 搜索层归 cx-shell：用事件解耦，避免 settings → shell 的模块环
      window.dispatchEvent(new CustomEvent("codex:open-search"));
    },
  },
  {
    id: "tasks",
    label: "打开任务",
    description: "跳转到 ARTEX 任务列表",
    group: "导航",
    defaultChord: "",
    run: (context) => context.navigate("/function/tasks"),
  },
  {
    id: "archived",
    label: "打开归档",
    description: "跳转到已归档任务（可恢复 / 删除）",
    group: "导航",
    defaultChord: "",
    run: (context) => context.navigate("/settings/archived"),
  },
  {
    id: "intranet",
    label: "打开内网会话",
    description: "内网会话的交互式 shell",
    group: "导航",
    defaultChord: "",
    run: (context) => context.navigate("/intranet"),
  },
  {
    id: "settings",
    label: "打开设置",
    description: "打开「常规」分区",
    group: "导航",
    defaultChord: "Ctrl+,",
    run: (context) => context.navigate("/settings/general"),
  },
  {
    id: "shortcuts-page",
    label: "显示键盘快捷键",
    description: "打开本页",
    group: "导航",
    defaultChord: "Ctrl+/",
    run: (context) => context.navigate("/settings/shortcuts"),
  },
  {
    id: "toggle-sidebar",
    label: "显示 / 隐藏侧边栏",
    description: "左侧历史与项目面板",
    group: "界面",
    defaultChord: "Ctrl+B",
    aliases: ["Ctrl+Shift+S"],
    guard: (event) => !selectionInsideEditor(event),
    run: () => {
      // use-sidebar 已经监听这个事件（桌面菜单「显示/隐藏侧边栏」也走它）
      window.dispatchEvent(new CustomEvent("codex:toggle-sidebar"));
    },
  },
  {
    id: "toggle-theme",
    label: "切换深色 / 浅色",
    description: "在深色与浅色之间切换（跟随系统的档位会被切到显式档）",
    group: "界面",
    defaultChord: "",
    run: (context) => context.toggleTheme(),
  },
  {
    id: "inspector",
    label: "组件检查器",
    description: "开关悬停/点击式的组件定位检查器（与 ?inspect=1 同一开关）",
    group: "调试",
    defaultChord: "Ctrl+Shift+X",
    run: () => {
      const toggle = (window as unknown as { __inspect?: (next?: boolean) => void }).__inspect;
      toggle?.();
    },
  },
];

/* ── 键位覆盖（localStorage：codex.commands）────────────────────────────── */

const STORAGE_KEY = "codex.commands";

function readOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && COMMANDS.some((command) => command.id === key)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

let overrides: Record<string, string> = readOverrides();
/** 录制期间置真：分发器让路（否则录制按下的组合键会顺手触发命令） */
let capturing = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // 隐私模式/配额满：内存态照常生效
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => overrides;
const getServerSnapshot = () => overrides;

/** 当前键位（覆盖表）；页面用它渲染"已改过"的行 */
export function useCommandChords(): Record<string, string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 写一个命令的键位；写回默认值 = 删掉覆盖 */
export function setCommandChord(id: string, chord: string) {
  const command = COMMANDS.find((item) => item.id === id);
  if (!command) return;
  const next = { ...overrides };
  if (!chord || chordEquals(chord, command.defaultChord)) delete next[id];
  else next[id] = chord;
  overrides = next;
  persist();
  emit();
}

export function resetAllCommandChords() {
  overrides = {};
  persist();
  emit();
}

/** 某命令当前生效的键位（覆盖 ?? 默认） */
export function commandChord(command: AppCommand, map: Record<string, string> = overrides): string {
  return map[command.id] ?? command.defaultChord;
}

/** 录制开关：置真时 useCommandHost 不派发 */
export function setCommandCapture(active: boolean) {
  capturing = active;
}

/** 找出与给定键位冲突的命令（同键位/同别名） */
export function findChordConflict(id: string, chord: string, map: Record<string, string> = overrides) {
  const norm = chord.trim().toLowerCase();
  if (!norm) return undefined;
  return COMMANDS.find((command) => {
    if (command.id === id) return false;
    const primary = commandChord(command, map);
    if (primary && primary.toLowerCase() === norm) return true;
    return (command.aliases ?? []).some((alias) => alias.toLowerCase() === norm);
  });
}

/**
 * 全局分发器：监听 keydown，把命中命令的键位派发出去。
 *
 * 让路规则（避免抢输入）：
 *   · 录制中（setCommandCapture(true)）不分发；
 *   · 焦点在可编辑元素里时，**只放行带 Ctrl/Alt/Meta 的组合键**（Ctrl+K 搜索照样能用），
 *     裸键（F11 之类）与 Ctrl+/ 这类会被拦掉 —— 官方在输入框里也保留大部分 Ctrl 组合。
 */
export function useCommandHost(context: CommandContext, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (capturing || event.defaultPrevented || event.repeat) return;
      if (event.isComposing) return;
      const chord = normalizeChord(event);
      if (!chord) return;

      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
      if (isEditable && !hasModifier) return;

      const command = COMMANDS.find((item) => {
        const primary = commandChord(item);
        const matches = (value: string) => value.length > 0 && chordEquals(value, chord);
        return matches(primary) || (item.aliases ?? []).some(matches);
      });
      if (!command) return;
      if (command.guard && !command.guard(event)) return;
      event.preventDefault();
      command.run(context);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [context, enabled]);
}
