"use client";

import * as React from "react";

import { usePathname } from "next/navigation";

import { ArrowLeftIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// 设置页导航（Codex 实测规格，1280×816）：
//   标题 h1 18px/600；搜索框 36px 高、9999px 药丸、底色白 8%、内文 14px；
//   分组标题 14px/500（行高 21、内边距 0 6px 0 8px）；
//   条目 30px 高、圆角 12.5px、14px/400，选中底色白 8%。
// Codex 的设置页把面板换成"设置导航"，所以这里也替换掉面板里的主导航。
type Item = { id: string; label: string; group: string };

const ITEMS: Item[] = [
  { id: "panel", label: "面板", group: "运行时" },
  { id: "traffic", label: "流量捕获", group: "运行时" },
  { id: "auto-bind", label: "Agent 自动绑定流量", group: "运行时" },
  { id: "proxy", label: "全局代理", group: "运行时" },
  { id: "constraints", label: "操作约束注入", group: "运行时" },
  { id: "websearch", label: "网络搜索", group: "运行时" },
  { id: "python", label: "自定义脚本 · Python 解释器", group: "交互" },
  { id: "concurrency", label: "工作并发 · Work Agent 数", group: "交互" },
  { id: "sendkey", label: "会话输入框发送键位", group: "交互" },
  { id: "update", label: "版本与更新", group: "关于" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<string>(ITEMS[0].id);

  // 滚动跟随：取滚动容器里最后一个越过顶部 80px 的分区当选中项。
  React.useEffect(() => {
    if (!pathname?.startsWith("/system")) return;
    const scroller = document.querySelector("main > div:nth-child(2)") as HTMLElement | null;
    const onScroll = () => {
      let current = ITEMS[0].id;
      for (const item of ITEMS) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 120) current = item.id;
      }
      setActive(current);
    };
    onScroll();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  // 静态导出下不能用 <a href="#id">（会整页跳转），自己滚动。
  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const q = query.trim().toLowerCase();
  const shown = ITEMS.filter((i) => !q || i.label.toLowerCase().includes(q));
  const groups = [...new Set(shown.map((i) => i.group))];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          aria-label="返回对话"
          title="返回对话"
          onClick={() => {
            window.location.href = "/chat/";
          }}
          className="codex-rail-item shrink-0"
        >
          <ArrowLeftIcon className="size-[18px]" strokeWidth={1.75} />
        </button>
        <h1 className="truncate text-[18px] leading-6 font-semibold">设置</h1>
      </div>

      <div className="shrink-0 px-2 pb-1">
        <div className="flex h-9 items-center gap-2 rounded-full bg-[rgb(255_255_255_/_0.08)] px-3">
          <SearchIcon className="text-muted-foreground size-[18px] shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索"
            aria-label="搜索设置"
            className="w-full border-0 bg-transparent text-[14px] outline-none placeholder:text-[color:var(--muted-foreground)]"
          />
        </div>
      </div>

      <nav aria-label="设置导航" className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {groups.map((group) => (
          <div key={group} className="pb-1">
            <div className="flex h-[30px] items-center px-2 text-[14px] leading-[21px] font-medium"> {group}</div>
            <div className="flex flex-col">
              {shown
                .filter((i) => i.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jump(item.id)}
                    className={cn(
                      "flex h-[30px] w-full items-center rounded-[12.5px] px-2 text-left text-[14px] leading-[21px]",
                      active === item.id
                        ? "bg-[rgb(255_255_255_/_0.08)] text-foreground"
                        : "text-muted-foreground hover:bg-[rgb(255_255_255_/_0.05)]",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="text-muted-foreground px-2 py-3 text-[13px]">没有匹配的设置项</p>
        )}
      </nav>
    </div>
  );
}
