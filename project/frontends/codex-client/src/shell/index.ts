/**
 * 外壳（shell）—— 应用的持久框架，不随路由切换重建。
 *
 * 对外暴露：AppShell（布局根）+ 各路由出口组件 + 侧栏状态钩子。
 * 内部结构（导轨 / 侧栏面板 / 主表面 / 搜索层）由本目录自行组织，
 * 外部不要深层 import（`@/shell/WorkspaceHeader` 是唯一的例外，见下）。
 *
 * 几何基准（参考端实测 @1280×816，dpr 1.5；出处 SPEC.md §3/§4/§5 + captures/*）
 *   外壳根          padding `0 4px 4px 0`        → 顶部栏宽 1276、内容底 812
 *   外壳底色        **rgb(40,40,40)**             ← 截图取色 + token --app-color-background-shell
 *   顶部菜单栏      [0,0 1276×**36**]             高 = --height-toolbar-sm
 *   左簇            [6,4 **102**×28]              gap 6px（导航组 62 + 侧栏组 28 + me 6）
 *   menubar         [108,6 215.33×23.33]          padding `0 8px 0 4px` gap 2px
 *   菜单触发钮      [112/163.33/214.67/266]       **49.33×23.33**  r 10px  cs SE1.5
 *                                                  padding `4px 10px`  14px/14px/400
 *   应用菜单下拉    y = **30** / 宽 220(文件·编辑·帮助) · **300**(视图)
 *   图标导轨        [0,44 **52**×768]             nav-list [6,50 40×716] 按钮 36×36 步进 44
 *   对话面板        [52,44 **288**×768]           bg color-mix(in oklab, rgb(24,24,24) 65%, transparent)
 *                                                  border-radius **12px 0 0 12px**
 *   面板 resizer    [332,44 **16**×768]
 *   主表面          [52,44 1224×768]              透明 + --app-shell-page-surface-shadow
 *   主内容面        [340,44 **936**×768]          bg rgb(24,24,24)  border-radius **0 12px 4px 0**
 *   内容视口        [341,96 **935**×716]          工作区 header 高 **52px**
 */

export { AppMenuBar } from "./AppMenuBar";
export { AppShell } from "./AppShell";
export { PageSurface } from "./PageSurface";
// task-28：面板页槽（/scheduled 的列表 portal 目标）与页面档位表。
// ⚠️ 跨域取用：`src/pages` 是本槽的**唯一**使用方（面板槽是外壳提供的能力），
//    走 barrel 而不是深路径，符合「跨域装配集中」的既有约定。
export {
  type PageHeaderMode,
  type PageLayout,
  type PanelMode,
  pageLayoutFor,
  type SurfaceLayout,
} from "./page-layouts";
export { PanelPortal, PanelSlotHost, usePanelSlot } from "./panel-slot";
export { SearchDialog } from "./SearchDialog";
export { SidebarPanel } from "./SidebarPanel";
export { SidebarRail } from "./SidebarRail";
export {
  closeSearchDialog,
  openSearchDialog,
  toggleSearchDialog,
  useSearchDialog,
} from "./use-search-dialog";
export type { SidebarState } from "./use-sidebar";
export { useSidebar } from "./use-sidebar";
export { WorkspaceHeader } from "./WorkspaceHeader";
