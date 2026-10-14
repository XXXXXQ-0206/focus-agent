import { useSyncExternalStore } from "react";

/**
 * 搜索对话层（Ctrl+K / Ctrl+Shift+P / 面板头的放大镜）的开关状态。
 *
 * 与 use-sidebar.ts 同一套模块级外部 store 写法：任何地方都能开，
 * 不需要 Provider；SearchDialog 挂在 AppShell 上。
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let open = false;

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const l of listeners) l();
}

export function openSearchDialog() {
  if (open) return;
  open = true;
  emit();
}

export function closeSearchDialog() {
  if (!open) return;
  open = false;
  emit();
}

export function toggleSearchDialog() {
  open = !open;
  emit();
}

const getSnapshot = () => open;

export function useSearchDialog() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * ⚠️ 2026-10-15：**键位监听已搬去设置里的命令系统**（src/settings/commands.ts 的 `search`，
 * 默认 Ctrl+K、固定别名 Ctrl+Shift+P，官方分工见 docs/SPEC-OVERLAYS.md：命令面板 =
 * CmdOrCtrl+K / CmdOrCtrl+Shift+P，Ctrl+/ 归「显示键盘快捷键」）。
 * 这里只保留状态操作：命令系统派发 `codex:open-search` 事件 → SearchDialog 调 toggleSearchDialog()。
 * 好处：键位可在「设置 → 键盘快捷键」里改，且不会出现"两处监听同一键位"的双触发。
 */
