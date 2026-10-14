/**
 * 其余 rail 页面（src/pages）—— 定时任务 / 插件 / 探索 / 代码审查。
 *
 * 对外只暴露四个路由组件（供 src/shell/routes.tsx 接线）：
 *   ScheduledRoute  /scheduled   官方 /scheduled（同页也挂 /automations）
 *   PluginsRoute    /plugins     官方 /plugins（与 /skills 共用浏览外壳）
 *   ExploreRoute    /explore     官方 /explore 是重定向到 /；见 ExplorePage.tsx 头部说明
 *   ReviewRoute     /review      官方 /pull-requests（rail 项 destinationId = builtin:pull-requests）
 *
 * 页面主体渲染进外壳主内容面 `.codex-surface__viewport`；外壳（rail / panel / 顶栏）不在本域。
 */

export { ExploreRoute } from "./ExplorePage";
export { PluginsRoute } from "./PluginsPage";
export { ReviewRoute } from "./ReviewPage";
export { ScheduledRoute } from "./ScheduledPage";
