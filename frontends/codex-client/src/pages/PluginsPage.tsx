import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  CodexAlertTriangle,
  CodexCheck,
  CodexEllipsis,
  CodexGear,
  CodexInfo,
  CodexPlusMd,
  CodexPuzzle,
  CodexRetry,
  CodexSearch,
  CodexX,
} from "@/icons";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui";

import { PLUGIN_CATEGORIES, PLUGINS, type PluginCard } from "./mock";
import { Badge, EmptyState, Segmented } from "./parts";

/** 官方目录分段（task-41）：capture 的 tablist 只有两个 tab（公开 / 个人），宽 122.67 = 59.33 + 4 + 59.33。
 *  官方 i18n 里还有 workspace 一档，但参考端该态没有渲染 ⇒ 本页只按实测的两个 tab 落地。 */
const DIRECTORY_TABS = [
  { id: "public", label: "公开" },
  { id: "personal", label: "个人" },
] as const;

/**
 * 页头壳的五个 `data-*` —— **能力声明，不是状态机**（task-48 官方实测，六态逐条比对）。
 *
 * 官方在**六种状态**下取值**恒定**：滚动 0 / 滚动半屏 / 滚动到底 / 搜索展开 / 视口 900 / 视口 700
 * ⇒ `data-scroll-collapse=true`、`data-expand-search=true`、`data-sticky=true`、
 *    `data-wrap-actions=true`、`data-collapsible=""`。
 * ⇒ **不要**给它们写状态机；真正的动态信号只有 `data-scrolled="true"`（滚动后追加，见组件里的 scroll 监听）。
 * 证据：captures/recon-official/official-task48-plugins-shell-states.json → states[*].shellAttrs
 *      （六态取值完全一致；只有 scroll-half / scroll-bottom 多出 data-scrolled）。
 */
const SHELL_CAPABILITY_ATTRS = {
  "data-collapsible": "",
  "data-expand-search": "true",
  "data-scroll-collapse": "true",
  "data-sticky": "true",
  "data-wrap-actions": "true",
} as const;

/**
 * 插件页（rail 第 3 项，路由 /plugins）。
 *
 * ── 真值来源 ────────────────────────────────────────────────────────────────
 * 路由：官方 `app-initial-25361a10f2bf.js:164633`
 *   `<Route path="/plugins">{ index → 组件 vOr, 子路由 pre → 组件 HCs }</Route>`
 *   同一组件 `vOr` 也挂在 `/skills` 的 index —— 所以它是「插件 / 技能」共用的浏览外壳，
 *   插件页只是它的 plugins tab（官方 `skills.appsPage.browseToggle` = Browse plugins or skills）。
 *   另有 `/plugins/:pluginId/app/:toolName` → 组件 `eCs`（插件工具视图，不在本页范围）。
 * 业务体 chunk：`plugins-skills-tabs-fbe9ee998899.js`（82KB，tab 外壳）、
 *   `plugins-cards-grid-d70c90e35c0c.js`（卡片与操作）、`installed-plugins-547d247e5c32.js`、
 *   `plugins-query-df6c7bdf37ed.js`、`plugins-state-188c79babb5b.js`。
 *
 * 几何（官方 className 实测，见 pages.css 头部 [C] 段）：
 *   卡片 chrome   `flex flex-col overflow-hidden rounded-lg border border-default` → 12.5px 圆角 + 1px 边框
 *   插件图标      `size-9 shrink-0 rounded-lg bg-text/10` → 36×36 / 12.5px
 *   行高          `flex h-11 items-center gap-2` → 44px
 *   列表头/页脚   `flex items-center justify-between gap-3 border-b border-border/40 px-2 pb-2`
 *   骨架          `h-3 w-20 rounded bg-text/10 motion-safe:animate-pulse`
 *   空态壳        `flex h-full min-h-full flex-1 items-center justify-center px-6 py-8 text-center`
 *   ⚠️ 「卡片网格」的分栏数是**未实测**：官方用的是带边框的行列表（`.cx-card` 即那个边框容器）。
 *      本页按任务要求做成自适应网格（minmax 280px），视觉语汇仍来自官方卡片 chrome。
 *
 * 文案（官方 defaultMessage / zh-CN 译文）：
 *   skills.appsPage.browseIntro.title            插件
 *   skills.appsPage.browseIntro.subtitle         连接插件，让 ChatGPT 在你的各类工具中协同工作
 *   skills.appsPage.browseIntro.codexSubtitle    Connect plugins to let Focus work across your tools
 *   skills.appsPage.browseTabs.plugins           Plugins → 插件
 *   skills.appsPage.browseToggle                 Browse plugins or skills → 浏览插件或技能
 *   skills.appsPage.search.plugins               搜索插件
 *   skills.appsPage.directoryTabs.public         公开
 *   skills.appsPage.directoryTabs.workspace      Workspace
 *   skills.appsPage.directoryTabs.personal       Personal
 *   skills.appsPage.directoryTabs.ariaLabel      Plugin directory → 插件目录
 *   skills.appsPage.section.connected            已安装
 *   skills.appsPage.section.discover             推荐
 *   skills.appsPage.section.marketplaces         市场
 *   skills.appsPage.section.installedApps        My Apps
 *   skills.appsPage.empty.plugins                未找到插件
 *   plugins.page.loading                         正在加载插件…
 *   plugins.page.loadError.title                 Failed to load plugins
 *   plugins.card.connect                         安装
 *   plugins.card.installing                      Installing → 正在安装
 *   plugins.card.enableButton                    启用
 *   plugins.card.disableMenuItem                 Disable → 停用
 *   plugins.card.uninstallMenuItem               Uninstall → 卸载
 *   plugins.card.actionsMenu                     Plugin actions → 插件操作
 *   plugins.card.moreActions                     More actions → 更多操作
 *   plugins.card.enableToggleTooltip             启用插件
 *   plugins.card.disableToggleTooltip            停用插件
 *   plugins.card.disabledByAdmin                 Disabled by admin → 管理员已停用
 *   plugins.card.disabledInstallTooltip          Access is turned off by your admin → 管理员已关闭访问
 *   plugins.card.unavailableInCurrentContext     Unavailable in this context → 当前环境不可用
 *   plugins.card.enableSuccess                   已启用插件 / disableSuccess 已停用插件
 *   plugins.card.uninstallSuccess                已卸载插件
 *   plugins.card.toggleError                     更新插件失败
 *   plugins.card.uninstallError                  卸载插件失败
 *   plugins.install.error                        安装插件失败
 *   plugins.card.copyShareLinkMenuItem           复制链接
 *   plugins.card.creator.you                     You → 你
 *   plugins.marketplace.removeSuccess            已移除 {marketplaceName} 市场
 *   skills.appsPage.pluginRequest.open           Request a plugin → 请求插件
 */
export function PluginsRoute() {
  const [plugins, setPlugins] = useState<PluginCard[]>(PLUGINS);
  /**
   * 初始 tab 由**路由**决定（task-47）。
   *
   * 缘由：`src/App.tsx:70-71` 把 `/plugins` 与 `/skills` **指向同一个组件**（`PluginsRouteView`），
   * 而 tab 原来是纯组件内 state、默认 "plugins" ⇒ 手输 /skills 看到的是「插件」视图。
   * 这是**内部一致性**问题（路由存在就该显示对应视图），**不声称官方依据** ——
   * 官方到底有没有 /skills 这个路由，本轮**未采集**（解包产物里只确证 /plugins 走 SLATE 布局）。
   *
   * 为什么用 effect 同步而不是只算 initial state：
   * 两个路由挂的是**同一个组件元素**，React 复用实例 ⇒ 从 /plugins 走到 /skills 时 state 不会重建，
   * 只给 useState 初值的话第二次进页仍是旧 tab。所以路由变化时把 tab 拉回来。
   * 页内点切换仍然是本地 state（**不写回 URL**）——最小改动，且切换后路由没变、effect 不会再覆盖它。
   */
  const { pathname } = useLocation();
  const routeTab: "plugins" | "skills" = pathname.startsWith("/skills") ? "skills" : "plugins";
  const [tab, setTab] = useState<"plugins" | "skills">(routeTab);
  useEffect(() => {
    setTab(routeTab);
  }, [routeTab]);
  const [directory, setDirectory] = useState<"public" | "workspace" | "personal">("public");
  const [category, setCategory] = useState<string>("全部");
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"ready" | "loading" | "error">("ready");
  const [toast, setToast] = useState<string | null>(null);

  /**
   * 页头壳的滚动态（task-48 ①）。
   *
   * 官方唯一的**动态信号**：滚动后给壳追加 `data-scrolled="true"`，并把 class 由
   * 边框色由**透明**换成**次级边框色**（这里刻意不写裸的 tailwind 类名 —— JS/TS 注释里的类名会被 Tailwind 当候选扫进产物，见 ENV-TRAPS E8 的更正）。
   * 滚动容器是本页的 `.cx-page__body`（官方同结构）。
   *
   * ⚠️ 结构差异（如实登记，未实现）：官方把壳 + 副标题行 + 分段行**都放在滚动容器里**，
   * 所以滚动半屏时副标题行 y = -493.33（滚走），壳则 sticky 在 y=28
   * （= 44 - 16，来自 shell-initial.css:3775-3778 的 `top: calc(var(--spacing) * -4)`，
   * 以及 :3886/:3951 对 `[data-scroll-collapse][data-collapsible]:has(_navigation_:empty)` 的
   * `top: -16px` 覆盖 —— 我们的壳正属这一组合）。
   * 本工程的三行在滚动容器**外**（task-41 的四层结构，逐值对齐过、不许改），
   * 所以滚动时：① 边框色照样切换 ✅ ② 副标题/分段行**不会滚走**、③ 壳**没有** 44→28 的位移。
   */
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 0);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (category !== "全部" && plugin.category !== category) return false;
      if (!needle) return true;
      return [plugin.name, plugin.author, plugin.description, plugin.category].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [plugins, category, query]);

  const installed = filtered.filter((plugin) => plugin.state === "installed");
  const recommended = filtered.filter((plugin) => plugin.state === "available");
  const rest = filtered.filter((plugin) => plugin.state !== "installed" && plugin.state !== "available");

  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((prev) => (prev === message ? null : prev)), 2600);
  };

  const setState = (id: string, next: PluginCard["state"], message: string) => {
    setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, state: next } : p)));
    announce(message);
  };

  const install = (plugin: PluginCard) => {
    if (plugin.disabledByAdmin) return;
    setState(plugin.id, "installing", `正在安装 ${plugin.name}…`);
    window.setTimeout(() => setState(plugin.id, "installed", `已安装 ${plugin.name}`), 900);
  };

  const renderCard = (plugin: PluginCard) => (
    <article className="cx-card" key={plugin.id}>
      <header className="cx-card__head">
        <span aria-hidden className="cx-row__icon">
          <CodexPuzzle size={20} />
        </span>
        <span className="cx-row__main">
          <span className="cx-card__name-row">
            <span className="cx-card__title">{plugin.name}</span>
            {/* 官方 /plugins 每张插件卡里有一个 16×16 的信息图标，悬停出 Radix **tooltip**
                （不是 HoverCard）：role=tooltip / data-side=top / 320×87.3 / 底 rgb(45,45,45) /
                圆角 20px / 内距 5px 12px / 字号 13px / 层级 50 / 阴影 rgba(15,23,42,.2) 0 8px 18px。
                证据：captures/recon-official/official-task48-hovercard.json（三张卡读数完全一致）。
                ⚠️ 文案：官方那段是**开发环境的清单路径提示**（Built by OpenAI · api_marketplace.json +
                C:\Temp\recon125b\…），属环境产物、不能照抄 ⇒ 这里只用卡内**既有字段**
                （author / category），按官方「来自 X / Y」的两行形状排布，**没有编造任何新事实**。 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button aria-label={`${plugin.name} 的来源信息`} className="cx-plugin-info" type="button">
                  <CodexInfo size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="cx-plugin-tip" side="top">
                <div>来自 {plugin.author}</div>
                <div className="cx-plugin-tip__meta">{plugin.category}</div>
              </TooltipContent>
            </Tooltip>
          </span>
          <span className="cx-card__author">{plugin.author === "OpenAI" ? "OpenAI" : plugin.author}</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="插件操作" size="2xs" uniform variant="ghost">
              <CodexEllipsis size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => announce(`已复制 ${plugin.name} 的链接`)}>
              复制链接
            </DropdownMenuItem>
            {plugin.state === "installed" ? (
              <>
                <DropdownMenuItem onSelect={() => setState(plugin.id, "disabled", `已停用 ${plugin.name}`)}>
                  停用
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setState(plugin.id, "available", `已卸载 ${plugin.name}`)}>
                  卸载
                </DropdownMenuItem>
              </>
            ) : plugin.state === "disabled" ? (
              <DropdownMenuItem onSelect={() => setState(plugin.id, "installed", `已启用 ${plugin.name}`)}>
                启用
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <p className="cx-card__description">{plugin.description}</p>

      <footer className="cx-card__footer">
        <span className="cx-card__tags">
          <Badge>{plugin.category}</Badge>
          {plugin.disabledByAdmin ? <Badge tone="warning">管理员已停用</Badge> : null}
          {plugin.state === "installed" && plugin.connected ? <Badge tone="open">已连接</Badge> : null}
        </span>
        {plugin.state === "installed" ? (
          <Button
            onClick={() => setState(plugin.id, "disabled", `已停用 ${plugin.name}`)}
            size="sm"
            variant="ghost"
          >
            <CodexCheck size={14} />
            已安装
          </Button>
        ) : plugin.state === "installing" ? (
          <Button disabled size="sm" loading variant="surface">
            正在安装
          </Button>
        ) : plugin.state === "disabled" ? (
          <Button
            onClick={() => setState(plugin.id, "installed", `已启用 ${plugin.name}`)}
            size="sm"
            variant="surface"
          >
            启用
          </Button>
        ) : plugin.disabledByAdmin ? (
          <Button disabled size="sm" variant="ghost" title="管理员已关闭访问">
            管理员已停用
          </Button>
        ) : (
          <Button onClick={() => install(plugin)} size="sm" variant="solid">
            安装
          </Button>
        )}
      </footer>
    </article>
  );

  return (
    // TooltipProvider 只为这一页提供官方 200ms 的 delayDuration（src/ui/tooltip.tsx:19-27）；
    // 不渲染任何 DOM。缺省 provider 时 Radix 会退回 700ms，与官方应用自有 provider 不符。
    <TooltipProvider>
      <div className="cx-page" data-page="plugins">
        {/* task-54：官方把「壳 + 副标题行 + 分段行」都放在**滚动容器内部**
            （官方结构：滚动容器 > 内容列 flex min-h-full w-full flex-col > [壳][副标题行][分段行][内容]）。
            我们原来把三行放在容器外 ⇒ 滚动时副标题/分段行不会滚走、壳也不会升 16px。
            现在按官方换父容器，壳的 position:sticky + top:-16px 因此真正生效（滚动后 y=44 → 28）。 */}
        <div className="cx-page__body" ref={bodyRef}>
          <div className="cx-slate-scroll">
            <header
              className="cx-slate-head"
              data-scrolled={scrolled ? "true" : undefined}
              {...SHELL_CAPABILITY_ATTRS}
            >
              <div className="cx-slate-head__content">
                <div className="cx-slate-head__row">
                  <div className="cx-slate-head__title">
                    <h1>{tab === "plugins" ? "插件" : "技能"}</h1>
                  </div>
                  <div className="cx-slate-head__actions">
                    <div className="cx-slate-toolbar">
                      <div className="cx-slate-search">
                        <label className="sr-only" htmlFor="plugins-store-page-search">
                          搜索插件
                        </label>
                        <div className="cx-slate-search__capsule">
                          <span aria-hidden className="cx-slate-search__icon">
                            <CodexSearch size={16} />
                          </span>
                          <input
                            id="plugins-store-page-search"
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索插件"
                            type="search"
                            value={query}
                          />
                        </div>
                      </div>
                      <div className="cx-slate-pageactions">
                        <button
                          aria-label="刷新"
                          className="cx-slate-iconbutton"
                          onClick={() => announce("已刷新插件列表")}
                          type="button"
                        >
                          <CodexRetry size={16} />
                        </button>
                        <button
                          aria-label="管理"
                          className="cx-slate-iconbutton"
                          onClick={() => announce("已打开插件管理")}
                          type="button"
                        >
                          <CodexGear size={16} />
                        </button>
                        <button
                          aria-label="添加"
                          className="cx-slate-primarybutton"
                          onClick={() => announce("已提交插件请求")}
                          type="button"
                        >
                          <CodexPlusMd size={16} />
                          <span>添加</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* 副标题行：官方是三层 —— 具名容器 / 带 data-page-subtitle 的行 / 文字块
          （容器 shell-shared.css:5422-5423，隐藏规则 shell-initial.css:4056-4061）。
          容器宽度 < 768 时官方整行 display:none（900/700 两态实测 searchRect.h = 0），
          所以容器不能同时是 data-page-subtitle 本身 —— 容器查不到自己。 */}
            <div className="cx-slate-subtitle">
              <div className="cx-slate-subtitle__row" data-page-subtitle="true">
                <div className="cx-slate-subtitle__text">
                  {tab === "plugins"
                    ? "连接插件，让 ChatGPT 在你的各类工具中协同工作"
                    : "把重复出现的提示词固化成技能，按项目或团队共享。"}
                </div>
              </div>
            </div>

            <div className="cx-slate-tabs">
              <div aria-label="插件目录" className="cx-slate-tablist" role="tablist">
                {DIRECTORY_TABS.map((item) => (
                  <button
                    aria-selected={directory === item.id}
                    className="cx-slate-tab"
                    key={item.id}
                    onClick={() => setDirectory(item.id)}
                    role="tab"
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cx-page__column cx-slate-content" style={{ gap: 20, maxWidth: "none" }}>
              {/* 本工程保留的筛选控件：官方 /plugins 页头没有这两组（官方页头只有 h1 + 搜索胶囊 + 刷新/管理/添加），
              为不丢功能留在内容区 —— 不参与顶部四层的几何。 */}
              <div className="cx-slate-filters">
                <Segmented
                  ariaLabel="浏览插件或技能"
                  onChange={setTab}
                  options={[
                    { id: "plugins", label: "插件" },
                    { id: "skills", label: "技能" },
                  ]}
                  value={tab}
                />
                <div className="cx-seg" style={{ flex: "0 0 auto" }}>
                  {PLUGIN_CATEGORIES.map((item) => (
                    <button
                      className="cx-seg__item"
                      data-selected={category === item ? "true" : undefined}
                      key={item}
                      onClick={() => setCategory(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {phase === "loading" ? (
                <div className="cx-card-grid">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div className="cx-card" key={index}>
                      <span className="cx-skeleton" style={{ width: 36, height: 36 }} />
                      <span className="cx-skeleton" style={{ width: 120, height: 12 }} />
                      <span className="cx-skeleton" style={{ width: "100%", height: 10 }} />
                    </div>
                  ))}
                </div>
              ) : null}

              {phase === "error" ? (
                <EmptyState
                  description="插件列表没能取到。检查网络或稍后重试。"
                  icon={CodexAlertTriangle}
                  title="无法加载插件"
                  actions={
                    <Button onClick={() => setPhase("ready")} size="sm" variant="surface">
                      重试
                    </Button>
                  }
                />
              ) : null}

              {phase === "ready" && filtered.length === 0 ? (
                <EmptyState
                  description={
                    query
                      ? `没有匹配「${query}」的插件。试试别的关键词，或把分类切回「全部」。`
                      : "这个目录下还没有可安装的插件。"
                  }
                  icon={CodexSearch}
                  title="未找到插件"
                  actions={
                    <>
                      <Button
                        onClick={() => {
                          setQuery("");
                          setCategory("全部");
                        }}
                        size="sm"
                        variant="surface"
                      >
                        清空筛选
                      </Button>
                      <Button onClick={() => announce("已提交插件请求")} size="sm" variant="ghost">
                        请求插件
                      </Button>
                    </>
                  }
                />
              ) : null}

              {phase === "ready" && installed.length > 0 ? (
                <section className="cx-page__section">
                  <h2 className="cx-page__section-title">
                    <CodexPuzzle size={16} />
                    已安装
                    <span className="cx-page__section-count">{installed.length}</span>
                  </h2>
                  <div className="cx-card-grid">{installed.map(renderCard)}</div>
                </section>
              ) : null}

              {phase === "ready" && recommended.length > 0 ? (
                <section className="cx-page__section">
                  <h2 className="cx-page__section-title">
                    推荐
                    <span className="cx-page__section-count">{recommended.length}</span>
                  </h2>
                  <div className="cx-card-grid">{recommended.map(renderCard)}</div>
                </section>
              ) : null}

              {phase === "ready" && rest.length > 0 ? (
                <section className="cx-page__section">
                  <h2 className="cx-page__section-title">
                    我的插件
                    <span className="cx-page__section-count">{rest.length}</span>
                  </h2>
                  <div className="cx-card-grid">{rest.map(renderCard)}</div>
                </section>
              ) : null}
            </div>
          </div>
        </div>

        {toast ? (
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              insetInline: 0,
              bottom: 16,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              className="cx-badge"
              style={{ height: 28, paddingInline: 12, background: "var(--color-surface-elevated)" }}
            >
              {toast}
              <CodexX size={12} />
            </span>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
