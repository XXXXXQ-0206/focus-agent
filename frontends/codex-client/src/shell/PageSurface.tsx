import type { ReactNode } from "react";

import type { PageHeaderMode, SurfaceLayout } from "./page-layouts";

/**
 * 主表面（对应官方的 _PageSurface_ / _MainContentSurface_）。
 *
 * 实测（captures/blocks-chat-home.json，@1280×816）：
 *   _PageSurface_         [52,44 **1224**×768]  透明；阴影
 *                         `0 0 0 .5px rgb(from rgba(255,255,255,.156) r g b / .06), 0 4px 16px 0 #0000000d`
 *   main（主内容面）       [**340**,44 **936**×768]  bg **rgb(24,24,24)**  **border-radius `0 12px 4px 0`**  左侧 1px 分隔
 *   _MainContentViewport_ [341,96 **935**×716]
 *
 * 三段关系：外壳行从 x=52 起 → 主表面从 52 起、宽 1224；
 * 主内容面被**面板让位 288px** 推到 x=340；再减去 1px 左边框 → 内容 341 起、宽 935。
 * 收起面板时让位改为 24px（见 use-sidebar.ts 的 inset）。
 */
export function PageSurface({
  children,
  header = "block",
  headerHeight = 0,
  layout = "default",
}: {
  children: ReactNode;
  /** task-28 · 页头档：`inline` = 页头浮层不占位（官方 /plugins、/explore，Frame y=44） */
  header?: PageHeaderMode;
  /** task-28 · block 档的页头占位高度（官方 /scheduled = 46；其余路由 0） */
  headerHeight?: number;
  /** task-28 · 主表面档：`full-bleed` = 从导轨右缘起、无左侧圆角（官方 /review） */
  layout?: SurfaceLayout;
}) {
  return (
    <main className="codex-page-surface" data-codex-page-surface="">
      <div className="codex-surface" data-app-shell-main-content-layout={layout}>
        {/* 官方 /scheduled 的 `_MainContentFrame_` y=90 = 44 + 46：那 46px 是
            `group/titlebar`（probe.results["[data-testid]"].first rect [340,44,936,46]，text 为空） */}
        {headerHeight > 0 ? <div aria-hidden className="codex-surface__page-header" /> : null}
        <div
          className="codex-surface__viewport"
          data-app-shell-inline-page-header={header === "inline" ? "true" : "false"}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
