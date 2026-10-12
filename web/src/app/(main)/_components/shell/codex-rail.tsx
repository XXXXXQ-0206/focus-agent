"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import { Bug, MessageSquare, Radar, Settings2, Target } from "lucide-react";

import { cn } from "@/lib/utils";

// Codex Desktop 复刻（实测）：最左侧 52px 图标导轨常驻，与 288px 对话面板并列；
// 面板可收起，导轨不动。导轨底色跟随窗口底色（--background），面板用卡片色。
const RAIL_ITEMS = [
  { href: "/chat", label: "对话", icon: MessageSquare },
  { href: "/function/tasks", label: "任务", icon: Target },
  { href: "/function/findings", label: "发现", icon: Bug },
  { href: "/intranet", label: "内网", icon: Radar },
];

export function CodexRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="codex-rail fixed inset-y-0 start-0 z-30 hidden flex-col items-center gap-1 pt-[calc(var(--codex-toolbar)+6px)] pb-3 md:flex"
    >
      {RAIL_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            title={item.label}
            aria-label={item.label}
            className={cn("codex-rail-item", active && "codex-rail-item-active")}
          >
            <item.icon className="size-[18px]" strokeWidth={1.75} />
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Link
          href="/system/settings"
          prefetch={false}
          title="设置"
          aria-label="设置"
          className={cn("codex-rail-item", pathname.startsWith("/system") && "codex-rail-item-active")}
        >
          <Settings2 className="size-[18px]" strokeWidth={1.75} />
        </Link>
      </div>
    </nav>
  );
}
