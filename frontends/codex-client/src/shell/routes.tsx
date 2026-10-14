import { Navigate, useParams } from "react-router-dom";

import { ChatRoute as ChatHomeView, ConversationRoute as ConversationView } from "@/chat";
import { ExploreRoute, PluginsRoute, ReviewRoute, ScheduledRoute } from "@/pages";
import { SettingsPage } from "@/settings";

/**
 * 路由出口的**唯一接线点**（lead 独占）。
 *
 * 各功能域只从自己的 barrel 导出组件，不直接互相 import；跨域装配集中在这里，
 * 这样任何一个域重构内部结构都不会牵动别人。
 *
 *   /new                  首页态（新聊天）
 *   /c/:conversationId    会话态
 *   /settings/:section    设置页（section 缺省时由 SettingsPage 回落到默认分区）
 */
export const ChatRoute = ChatHomeView;
export const ConversationRoute = ConversationView;

// rail 的其余四项（官方 rail 实测序：首页/定时任务/插件/探索 ── 代码审查）
export const ScheduledRouteView = ScheduledRoute;
export const PluginsRouteView = PluginsRoute;
export const ExploreRouteView = ExploreRoute;
export const ReviewRouteView = ReviewRoute;

/** 设置页自带分区导航，section 由它自己从 useParams 读取 */
export function SettingsRoute() {
  return <SettingsPage />;
}

export function SettingsSectionRoute() {
  return <SettingsPage />;
}

/** 控件库（/controls）：本工程已还原控件的标本台页面（task-38 用户需求） */
export function ControlsRoute() {
  return <Navigate replace to="/settings" />;
}

/** 未知路径回落到首页（新聊天），而不是给一个死页面 */
export function NotFoundRoute() {
  return <Navigate replace to="/new" />;
}

/** 供需要读会话 id 的组件复用 */
export function useConversationId() {
  return useParams().conversationId;
}
