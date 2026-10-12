"use client";

import { type ReactNode, useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountSwitcher } from "./sidebar/account-switcher";
import { LayoutControls } from "./sidebar/layout-controls";
import { SearchDialog } from "./sidebar/search-dialog";
import { ThemeSwitcher } from "./sidebar/theme-switcher";
import { UpdateBadge } from "./update-badge";

// 任务详情页保持原样：它自带头部/Tabs 与内边距，这里不再叠加全局头部和 padding。
function isFullBleed(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  return p.startsWith("/function/tasks/");
}

export function MainContent({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const pathname = usePathname();
  const { open, isMobile } = useSidebar();
  const [version, setVersion] = useState("");

  // 左侧 288px 面板是「浮」在主表面之上的，不占布局宽度（Codex 实测几何）。
  // 所以主内容必须自己让开这段宽度，否则每页左侧 288px 会被面板盖住。
  const panelOpen = open && !isMobile;
  // 注意：带 data-content-padding=false 的页面（如 /chat）会被 `md:has-data-[...]:p-0` 把
  // 内边距整体清零，而它的变体数比 `md:pl-*` 多、在 Tailwind 里排在后面 —— 所以
  // 让开面板这件事必须两种形态都写一遍，否则 chat 路由上会被 p-0 吃掉。
  const padForPanel = panelOpen
    ? "md:pl-[18rem] md:has-data-[content-padding=false]:pl-[18rem]"
    : undefined;

  useEffect(() => {
    api
      .health()
      .then((h) => setVersion((h.version ?? "").replace(/^v(?=\d)/, "")))
      .catch(() => setVersion(""));
  }, []);

  if (isFullBleed(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
          "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
        )}
      >
        <div className="flex w-full items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-1 lg:gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <SearchDialog />
          </div>
          <div className="flex items-center gap-2">
            {version && (
              <span className="font-medium text-muted-foreground text-xs tabular-nums">版本 · {version}</span>
            )}
            <UpdateBadge />
            <LayoutControls />
            <ThemeSwitcher />
            <AccountSwitcher users={[currentUser]} />
          </div>
        </div>
      </header>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0",
          padForPanel,
        )}
      >
        {children}
      </div>
    </>
  );
}
