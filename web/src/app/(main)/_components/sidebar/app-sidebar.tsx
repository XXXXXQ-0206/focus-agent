"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { SettingsNav } from "./settings-nav";
import { NavUser } from "./nav-user";
import { SidebarSupportCard } from "./sidebar-support-card";


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const currentUser = useCurrentUser();
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/function/tasks">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="ARTEX" width={40} height={40} className="shrink-0" />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Codex 式外壳：面板主体是「对话列表」（由 /chat 页 portal 渲染进来）；
            导航已经在 52px 导轨上，故 chat 路由下隐藏这里的 NavMain（见 globals.css 的
            html[data-chat-list="on"] 规则），其余路由仍用它。 */}
        <div id="chat-conversations-slot" className="flex min-h-0 min-w-0 flex-1 flex-col" />
        {/* Codex 设置页会把面板换成"设置导航"（搜索 + 分组 + 条目），见 globals.css 的
            html[data-settings-nav="on"] 规则：该属性下隐藏主导航。 */}
        <div data-slot="sidebar-settings-nav" className="hidden min-h-0 min-w-0 flex-1 flex-col">
          <SettingsNav />
        </div>
        <div data-slot="sidebar-nav-main">
          <NavMain items={sidebarItems} />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
