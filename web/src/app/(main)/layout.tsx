"use client";

import type { ReactNode } from "react";
import * as React from "react";

import { AppSidebar } from "@/app/(main)/_components/sidebar/app-sidebar";
import { CodexRail } from "@/app/(main)/_components/shell/codex-rail";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { getClientCookie } from "@/lib/cookie.client";
import { cn } from "@/lib/utils";

import { MainContent } from "./_components/main-content";

// Reads a layout-critical preference from the browser cookie (falls back to the
// default during static-export prerender where document is unavailable). Kept
// fully client-side so the app can be statically exported — no Server Actions /
// next/headers.
function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof document === "undefined") return fallback;
  const value = getClientCookie(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  // Client-side auth gate — replaces the Next proxy/middleware that static export
  // disables. No token → bounce to /login; render nothing until confirmed so no
  // protected UI (or its API calls) flashes for a logged-out visitor.
  const [authed, setAuthed] = React.useState(false);
  React.useEffect(() => {
    if (auth.getToken()) {
      setAuthed(true);
    } else {
      // 客户端守卫认为未登录时，必须同时清掉 cookie：否则 proxy.ts 仅凭
      // “cookie 存在”就把我们从 /login 又重定向回主界面，与本守卫来回弹跳
      // 形成无限重定向 → 白屏（cookie 与 localStorage 不一致时触发）。
      auth.clearToken();
      window.location.href = "/login";
    }
  }, []);

  const defaultOpen = typeof document === "undefined" ? true : getClientCookie("sidebar_state") !== "false";

  if (!authed) return null;

  // Codex Desktop 复刻（实测几何）：
  //   根容器右/下各留 4px；顶部 46px 拖拽条；
  //   52px 图标导轨常驻 + 288px 对话面板（可收起）叠在圆角主表面之上；
  //   主表面从 x=52px 起，与面板重叠——面板浮在表面上，而不是把表面挤开。
  return (
    // Codex 实测竖向几何：顶部 36px 窗口条 + 8px 间距 → 主表面/导轨/面板都从 y=44 起，
    // 底部留 4px（1280×816 时主表面正好 768 高）。
    <div className="flex h-svh flex-col pr-[4px] pb-[4px] pt-9">
      <div className="codex-drag-strip" aria-hidden />
      <SidebarProvider
        defaultOpen={defaultOpen}
        className="min-h-0 flex-1"
        style={
          {
            "--sidebar-width": "18rem",
          } as React.CSSProperties
        }
      >
        <CodexRail />
        <AppSidebar
          variant="floating"
          collapsible="offcanvas"
          className="md:data-[side=left]:!left-[3.25rem]"
        />
        <SidebarInset
          className={cn(
            "codex-surface mt-2 ml-[3.25rem]",
            "[html[data-content-layout=centered]_&>*]:mx-auto",
            "[html[data-content-layout=centered]_&>*]:w-full",
            "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
            "[--dashboard-header-height:--spacing(12)]",
            "min-w-0 overflow-x-hidden",
          )}
        >
          <MainContent>{children}</MainContent>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
