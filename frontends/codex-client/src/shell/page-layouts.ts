/**
 * 页面档位表：**同一处**驱动主表面的三档（task-28）。
 * ============================================================================
 * 官方出处（captures/recon-official/）：
 *  · /review        `official-rail-review.json` `dom.nodes[1077]`
 *                   `data-app-shell-main-content-layout=**full-bleed**`；main [52,44,1224×768]、
 *                   class **无** `_MainContentLeftBorder_`；`dom.nodes[1078]` `_MainContentFrame_` y=**44**
 *  · /plugins       `official-rail-plugins.json` `dom.nodes[1033]`
 *                   `data-app-shell-inline-page-header=true`，Frame y=**44**（页头浮层、不占位）
 *  · /scheduled     `official-rail-scheduled.json` `dom.nodes[1002]` `_MainContentFrame_` y=**90**
 *                   = 44 + 46 ⇒ **46px 页头占位档**；那 46px 的 `group/titlebar`
 *                   （`probe.results["[data-testid]"].first` rect [340,44,936,46]，text 为空）
 *  · 面板内容       /scheduled 的 `probe.results.aside.first.text` 含「定时任务 新建任务 即将执行
 *                   暂无已安排的任务」⇒ 列表在 **aside**、主面只放空态/详情 ⇒ `panel: "page"`
 *  ⚠️ /explore **不在本表**：官方是**重定向**（`app-initial-25361a10f2bf.js` 偏移 11,851,996 / 行 164,633），
 *     原先那条 `/explore` 分支建立在**采集假象**上（task-39/40 已定案）。
 *
 * ⚠️ 只有这四条路由进了本表；其余（/new、/c/*、/settings*）一律 default/default/content ——
 *    verify 的 12 条几何打的就是它们，档位必须逐字保持原样。
 */

export type SurfaceLayout = "default" | "full-bleed";
export type PageHeaderMode = "block" | "inline";
export type PanelMode = "content" | "page";

export interface PageLayout {
  surface: SurfaceLayout;
  header: PageHeaderMode;
  panel: PanelMode;
  /** block 档的页头占位高度（px）。官方 /scheduled 实测 46；其余路由为 0（不占位） */
  headerHeight: number;
}

const BASE: PageLayout = { surface: "default", header: "block", panel: "content", headerHeight: 0 };

/** 官方 /scheduled 的 46px 页头占位（`_MainContentFrame_` y=90 = 44+46） */
const SCHEDULED: PageLayout = { surface: "default", header: "block", panel: "page", headerHeight: 46 };
/** 官方 /plugins、/explore：页头浮层，内容从 main 顶起（Frame y=44） */
const SLATE: PageLayout = { surface: "default", header: "inline", panel: "content", headerHeight: 0 };
/** 官方 /review：full-bleed，主表面从导轨右缘起、无左侧圆角/边框、无页头占位 */
const FULL_BLEED: PageLayout = { surface: "full-bleed", header: "block", panel: "content", headerHeight: 0 };

export function pageLayoutFor(pathname: string): PageLayout {
  if (
    pathname === "/scheduled" ||
    pathname === "/automations" ||
    pathname === "/inbox" ||
    pathname === "/function/tasks"
  )
    return SCHEDULED;
  // [task-40] `/explore` 已从本表移除（官方是重定向，不是页面）。
  if (pathname === "/plugins") return SLATE;
  if (pathname === "/review" || pathname === "/pull-requests") return FULL_BLEED;
  return BASE;
}
