import { useMemo, useState } from "react";

import {
  CodexAlertTriangle,
  CodexArrowRight,
  CodexClock,
  CodexCode,
  CodexGrid,
  CodexLightbulb,
  CodexPuzzle,
  CodexRocket,
  CodexSearch,
  CodexSparkle,
  CodexStar,
} from "@/icons";
import { Button } from "@/ui";

import { EXPLORE_CATEGORIES, EXPLORE_ITEMS, EXPLORE_SOURCES } from "./mock";
import { Badge, EmptyState, Segmented } from "./parts";

/**
 * 探索页（rail 第 4 项，路由 /explore）。
 *
 * ⚠️ **【task-40 现况】官方是重定向，本组件已不再挂载**：`src/App.tsx` 的 `path="explore"` 现在渲染
 *    `<Navigate replace to="/" />`；`rail-items.ts` 里那条死的 `to` 也删了。**本文件保留仅为历史对照**
 *    （删它会牵动 `pages/index.ts`、`pages/dev-preview.tsx`、`pages.css` 多处）。
 *    行为断言见 `tools/behave/cases/routing.mjs` 的 `rt.explore.redirects-home`。
 *
 * ⚠️ **官方没有独立的「探索页」** —— 这一条是实测结论，不是猜测：
 *   1. 路由 `app-initial-25361a10f2bf.js:164633`：
 *      `<Route path="/explore" element={<Navigate to="/" replace/>}/>` —— /explore 直接重定向回首页。
 *   2. rail 第 4 项在官方是**一个菜单（popover）**，不是页面：
 *      官方 i18n `sidebarCustomization.moreMenu` 的 defaultMessage = `Explore`，
 *      description = `Opens the sidebar Explore menu containing secondary destinations`；
 *      zh-CN 译文 = 「探索」（zh-CN-b05cfd55c534.js 实测）。
 *      导轨组件收到 `renderExploreMenu: m1o`（app-initial，偏移约 10673220 的 rail props），
 *      菜单条目来自 `exploreDestinations` 分组（同一处 `txo(j10, ...)` 的返回值）。
 *   3. 官方**有**一个「Explore feed」（首页动态流）：
 *      zh-Hans-6d9213662c0b.js 里有 `正在加载“探索”动态`（loading）、`出了点问题。`
 *      （feed 空或失败）、`无法加载选项`（无卡片时的标题）、`关闭来源菜单`、
 *      以及来源筛选（精选 / 常青内容 / 资料库 …，多数标注 Development-only）。
 *
 * 因此本页按「最接近官方设计语言」实现，并在下面逐条标出哪些来自实测、哪些是推导：
 *   · 顶部来源筛选（全部 / 精选 / 常青内容 / 资料库）   ← 实测：官方 Explore feed 的来源筛选
 *   · 分类瓦片（精选 / 上手 Codex / 插件 / 技能 / 定时任务 / 代码审查）
 *                                                    ← 推导：目的地取自官方 Explore 菜单
 *                                                      （`sidebar.explore.codex` = Codex、
 *                                                       `sidebar.explore.setupCodex` = 设置 Codex）
 *                                                       与官方分组名 `skills.appsPage.section.*`
 *   · 卡片流（标题 / 说明 / 角标）                     ← 实测形态：官方 Explore feed 是卡片流；
 *                                                      卡片内部几何**未实测**，按 token 推导
 *   · 卡片网格分栏                                    ← **未实测**，按 token 推导（minmax 280px）
 *                                                      ⚠️ [task-70] 离线核对：官方材料里**查无** minmax(280px) 网格 ——
 *                                                      扫过 app/webview/assets/*.css + captures/css-pretty/*.css + 全部 14,624 个 chunk：
 *                                                      仅 visualization 插件自己的样式表有 minmax(280px,1fr)（与卡片流无关），
 *                                                      官方 grid 工具类只有 10rem（home-suggestion-surface @4167）与 4.75rem（键帽 @94632）。
 *                                                      ⇒ 判定「**仍无证据**」：280px 是我们的取值，不是官方读数；
 *                                                      另注：官方 /plugins 用的是**带边框的行列表**（见 PluginsPage.tsx 头注），不是网格。
 *
 * 文案（官方 defaultMessage / zh-CN）：
 *   sidebarCustomization.moreMenu       Explore / 探索
 *   sidebar.explore.codex               Codex / Codex
 *   sidebar.explore.setupCodex          Setup Codex / 设置 Codex
 *   sidebar.explore.unpinDestination    Unpin from sidebar → 从侧栏取消固定
 *   sidebarOnboardingChecklist.exploreCodex   Explore what Codex can do → 探索 Codex 能做什么
 *   正在加载“探索”动态（Explore feed loading）
 *   出了点问题。（Explore feed 空或失败）
 *   无法加载选项（无卡片时的标题）
 *   关闭来源菜单（来源菜单的无障碍标签）
 *   精选 / 常青内容 / 全部 / 资料库（Explore feed 来源筛选项）
 */
export function ExploreRoute() {
  const [source, setSource] = useState<string>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [phase, setPhase] = useState<"ready" | "loading" | "error">("ready");

  const items = useMemo(() => {
    return EXPLORE_ITEMS.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (category && item.category !== category) return false;
      return true;
    });
  }, [source, category]);

  const iconFor = (id: string) => {
    switch (id) {
      case "featured":
        return CodexStar;
      case "setup":
        return CodexRocket;
      case "plugins":
        return CodexPuzzle;
      case "skills":
        return CodexLightbulb;
      case "automations":
        return CodexClock;
      case "review":
        return CodexCode;
      default:
        return CodexGrid;
    }
  };

  return (
    <div className="cx-page" data-page="explore">
      <div className="cx-page__toolbar">
        <Segmented
          ariaLabel="探索来源"
          onChange={setSource}
          options={EXPLORE_SOURCES.map((item) => ({ id: item.id, label: item.label }))}
          value={source}
        />
        <div className="cx-page__toolbar-trailing">
          <Button
            onClick={() => setPhase(phase === "error" ? "ready" : "error")}
            size="sm"
            variant="ghost"
            title="演示错误态与空态"
          >
            {phase === "error" ? "恢复内容" : "模拟失败"}
          </Button>
        </div>
      </div>

      <div className="cx-page__body">
        <header>
          {/* [task-24] 同 plugins：官方 h1 为 500 24px/28.8px、min-h-9（36px），见 pages.css 的 slate 规则 */}
          <h1>探索</h1>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
            挑一个方向开始：精选示例、可直接安装的插件，或者让 Codex 按计划跑起来。
          </p>
        </header>

        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            <CodexSparkle size={16} />
            分类
            {category ? (
              <button
                className="cx-page__section-count"
                onClick={() => setCategory(null)}
                style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}
                type="button"
              >
                清除筛选
              </button>
            ) : null}
          </h2>
          <div className="cx-tile-grid">
            {EXPLORE_CATEGORIES.map((item) => {
              const Icon = iconFor(item.id);
              return (
                <button
                  className="cx-tile"
                  data-selected={category === item.id ? "true" : undefined}
                  key={item.id}
                  onClick={() => setCategory(category === item.id ? null : item.id)}
                  style={
                    category === item.id ? { background: "var(--cx-pages-selected-background)" } : undefined
                  }
                  title={item.description}
                  type="button"
                >
                  <span aria-hidden className="cx-tile__icon">
                    <Icon size={18} />
                  </span>
                  <span className="cx-tile__label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            {source === "all" ? "全部内容" : (EXPLORE_SOURCES.find((s) => s.id === source)?.label ?? "内容")}
            <span className="cx-page__section-count">{items.length}</span>
          </h2>

          {phase === "loading" ? (
            <div className="cx-card-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="cx-card" key={index}>
                  <span className="cx-skeleton" style={{ width: 120, height: 12 }} />
                  <span className="cx-skeleton" style={{ width: "100%", height: 10 }} />
                  <span className="cx-skeleton" style={{ width: "70%", height: 10 }} />
                </div>
              ))}
            </div>
          ) : null}

          {phase === "error" ? (
            <EmptyState
              description="出了点问题。动态流没能取到内容，稍后再试一次。"
              icon={CodexAlertTriangle}
              title="无法加载选项"
              actions={
                <Button onClick={() => setPhase("ready")} size="sm" variant="surface">
                  重试
                </Button>
              }
            />
          ) : null}

          {phase === "ready" && items.length === 0 ? (
            <EmptyState
              description={
                category
                  ? "这个分类下暂时没有内容。换一个分类，或回到「全部内容」。"
                  : "这个来源下暂时没有内容，换一个来源看看。"
              }
              icon={CodexSearch}
              title="出了点问题。"
              actions={
                <Button
                  onClick={() => {
                    setCategory(null);
                    setSource("all");
                  }}
                  size="sm"
                  variant="surface"
                >
                  回到全部内容
                </Button>
              }
            />
          ) : null}

          {phase === "ready" && items.length > 0 ? (
            <div className="cx-card-grid">
              {items.map((item) => (
                <article className="cx-card cx-card--interactive" key={item.id}>
                  <header className="cx-card__head">
                    <span className="cx-row__main">
                      <span className="cx-card__title">{item.title}</span>
                      <span className="cx-card__author">
                        {EXPLORE_CATEGORIES.find((c) => c.id === item.category)?.label ?? "探索"}
                      </span>
                    </span>
                    <Badge tone={item.tag === "官方" ? "accent" : undefined}>{item.tag}</Badge>
                  </header>
                  <p className="cx-card__description">{item.description}</p>
                  <footer className="cx-card__footer">
                    <span className="cx-muted">
                      {EXPLORE_SOURCES.find((s) => s.id === item.source)?.label ?? ""}
                    </span>
                    <Button size="sm" variant="ghost">
                      打开
                      <CodexArrowRight size={14} />
                    </Button>
                  </footer>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
