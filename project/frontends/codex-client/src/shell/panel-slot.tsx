import { type ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * 面板插槽（task-28）：/scheduled 的列表要住在 **aside(340)** 里，而不是主面。
 *
 * 官方读数：`official-rail-scheduled.json` `probe.results.aside.first.text` =
 *   「首页 定时任务 插件 探索 代码审查 **定时任务 新建任务 即将执行 暂无已安排的任务**」
 * 而 `probe.results.main.first.text` =「🕗 安排任务 ChatGPT 可以帮你处理持续性任务… 新建任务」
 * ⇒ 列表在面板、主面只放空态/详情。
 *
 * ⚠️ 为什么用模块级 store 而不是 React Context：`SidebarPanel` 与页面（`<Outlet/>` 在
 * `PageSurface` 里）是**兄弟**，context 只向下传，读不到。本仓库 `use-sidebar.ts` 已是
 * 同一套外部 store 模式，这里保持一致。
 */

let slotNode: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSlot(node: HTMLElement | null) {
  if (slotNode === node) return;
  slotNode = node;
  for (const listener of listeners) listener();
}

/** 面板里的槽位宿主：只有 `panel: "page"` 档才渲染 */
export function PanelSlotHost() {
  return <div className="codex-panel__page-slot" data-panel-page-slot="" ref={setSlot} />;
}

/** 页面拿到的 portal 目标；null = 没有面板槽（收起/未挂载） */
export function usePanelSlot() {
  return useSyncExternalStore(
    subscribe,
    () => slotNode,
    () => null,
  );
}

/** 把页面内容放进面板槽；无槽时渲染 fallback（就地渲染） */
export function PanelPortal({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const node = usePanelSlot();
  return node ? createPortal(children, node) : fallback;
}
