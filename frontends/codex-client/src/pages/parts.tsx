import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";

import { type CodexIconProps, CodexSearch, CodexX } from "@/icons";

import "./pages.css";

/**
 * 四个页面共用的小件。全部是「官方结构 + 官方 token」的直接落点，
 * 几何与文案出处写在各处注释里。样式在 ./pages.css。
 */

export type PagePhase = "loading" | "ready" | "empty" | "error";

/**
 * Slate 页面骨架（官方 /plugins 页头四层，见 src/pages/PluginsPage.tsx 的实测注释）：
 *   slate 页头（h1 + 搜索胶囊 + 动作）→ 副标题行 →（可选）分区 tab 行 → 内容列。
 *
 * 这是全应用业务页的统一 chrome：Agent / 系统资源 / 设置（另一种 pane 形态）/ 工作区 /
 * 命令记录 / 同步 / 内网会话 / 总览 都从这里渲染；页面只提供内容与数据。
 * 五个 data-* 是**能力声明**（官方六态实测取值恒定），真正的动态信号只有 data-scrolled。
 */
const SLATE_CAPABILITY_ATTRS = {
  "data-collapsible": "",
  "data-expand-search": "true",
  "data-scroll-collapse": "true",
  "data-sticky": "true",
  "data-wrap-actions": "true",
} as const;

export interface SlateSearchConfig {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export function SlatePage({
  title,
  actions,
  children,
  fill = false,
  search,
  subtitle,
  tabs,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** true = 内容列占满剩余高度（两栏 split 等需要内部滚动的版式用）。 */
  fill?: boolean;
  search?: SlateSearchConfig;
  subtitle: string;
  tabs?: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const onScroll = () => setScrolled(element.scrollTop > 0);
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="cx-page" data-page={`artex-${title}`}>
      <div className="cx-page__body" ref={bodyRef}>
        <div className="cx-slate-scroll">
          <header
            className="cx-slate-head"
            data-scrolled={scrolled ? "true" : undefined}
            {...SLATE_CAPABILITY_ATTRS}
          >
            <div className="cx-slate-head__content">
              <div className="cx-slate-head__row">
                <div className="cx-slate-head__title">
                  <h1>{title}</h1>
                </div>
                <div className="cx-slate-head__actions">
                  <div className="cx-slate-toolbar">
                    {search ? (
                      <div className="cx-slate-search">
                        <label className="sr-only" htmlFor={search.id}>
                          {search.placeholder}
                        </label>
                        <div className="cx-slate-search__capsule">
                          <span aria-hidden className="cx-slate-search__icon">
                            <CodexSearch size={16} />
                          </span>
                          <input
                            id={search.id}
                            onChange={(event) => search.onChange(event.target.value)}
                            placeholder={search.placeholder}
                            type="search"
                            value={search.value}
                          />
                        </div>
                      </div>
                    ) : null}
                    {actions ? <div className="cx-slate-pageactions">{actions}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="cx-slate-subtitle">
            <div className="cx-slate-subtitle__row" data-page-subtitle="true">
              <div className="cx-slate-subtitle__text">{subtitle}</div>
            </div>
          </div>

          {tabs}

          <div
            className={
              fill
                ? "cx-page__column cx-slate-content cx-slate-content--fill"
                : "cx-page__column cx-slate-content"
            }
            style={{ gap: 20, maxWidth: "none" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 分段控件 ─────────────────────────────────────────────────────────────── */

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

/**
 * 分段控件（官方 _SegmentedControl_）。
 * 出处：官方 token `--segmented-control-*`（styles/tokens.css:52）；
 *      定时任务页的「状态 / 归属」两个筛选器用的就是它
 *      （automations-page-d71c8cae4d53.js 里的组件 `Or`，size:`toolbar`）。
 */
export function Segmented<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div aria-label={ariaLabel} className="cx-seg" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option.id === value}
          className="cx-seg__item"
          data-selected={option.id === value ? "true" : undefined}
          key={option.id}
          onClick={() => onChange(option.id)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── 搜索框 ───────────────────────────────────────────────────────────────── */

/**
 * 搜索框。占位文案一律取官方 i18n 原文的 zh-CN 译文，由调用方传入。
 * 官方 `skills.pageSearchInput.clear` →「清除搜索」。
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <div className="cx-search">
      <span className="cx-search__icon">
        <CodexSearch size={16} />
      </span>
      <input
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value ? (
        <button aria-label="清除搜索" className="cx-search__clear" onClick={() => onChange("")} type="button">
          <CodexX size={12} />
        </button>
      ) : null}
    </div>
  );
}

/* ── 空态 ─────────────────────────────────────────────────────────────────── */

/**
 * 空态。官方四处空态的共同形态（出处见各页注释）：
 *   图标艺术字块 → 标题（text-base/500）→ 说明（text-sm/次级）→ 主次动作。
 * 列宽 320 / gap 12 取官方 pull-request-route 的 `max-w-80 flex-col items-center gap-3`。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  inline,
  layout = "column",
  titleAs: Title = "h2",
}: {
  icon: ComponentType<CodexIconProps>;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  inline?: boolean;
  /**
   * 三档几何，各自有官方实测出处（不再是一套尺寸套四个页面）：
   *  · `column`（默认）—— 官方 pull-request 空态列 `max-w-80 flex-col items-center gap-3`（320 / gap 12）
   *  · `page`   —— 官方 `/scheduled` 主面空态（`official-rail-scheduled.json` dom.nodes 1007-1010）：
   *                外层 `w-full items-center px-3 flex flex-col justify-center py-6 min-h-full pb-11 select-none`；
   *                内层 `flex w-full max-w-xl flex-col items-center text-center justify-center gap-3 max-w-[46.125rem]! gap-11`
   *                ⇒ 738 宽 / 组间 44 / 容器内边距 24px 12px 44px / 垂直居中；
   *                文字组实测高 108 = 艺术块 48 + gap 8 + 标题 24 + gap 8 + 说明 20（**推导**：由 108 反解出艺术块 48）
   *  · `center` —— 官方 `/review` 错误态（`official-rail-review.json` dom.nodes 1083-1085）：
   *                `flex h-full min-h-0 items-center justify-center select-none` +
   *                `w-full items-center px-3 flex flex-col justify-center py-6` +
   *                `flex w-full max-w-xl flex-col items-center text-center justify-center gap-3`
   *                ⇒ 576 宽 / gap 12 / 满高垂直居中（实测：容器 768 高，块 85.9 高，y=361.05 ⇒ 正中）
   */
  layout?: "column" | "page" | "center";
  /**
   * 标题标签。默认 h2（**保持既有四页不变**）。
   * [task-61] 官方 /scheduled 主面 hero 的标题是 **h1**：task-59 ① 实测 rect 70.21×26、
   * 字号 18 / 行高 26 / 字重 400 / 字距 -0.025em / 色 rgb(223,223,223)。
   * 为什么不直接把默认改成 h1：plugins 与 explore 两页各有一条按标签写的标题规则
   * （特异度高于本组件的类规则），空态标题一旦变成 h1 就会被那两条接管、字号从 16 跳到 24
   * ⇒ 会让那两页漂移。所以做成显式开关，只有拿到官方标签读数的那一页传 h1。
   */
  titleAs?: "h1" | "h2";
}) {
  const classes = ["cx-empty"];
  if (inline) classes.push("cx-empty--inline");
  if (layout === "page") classes.push("cx-empty--page");
  if (layout === "center") classes.push("cx-empty--center");
  return (
    <div className={classes.join(" ")}>
      {/* [task-67] 官方 /scheduled hero 的文字区是**两层 wrapper**（task-65 两条独立证据：
          官方产物 landing-a68abc99045a.js 的 `flex flex-col items-center gap-3` @22803 与
          `gap-0.5` @22878；官方运行时 DOM 同形）：外层 gap 12 包 [艺术字, 内层]，内层 gap 2 包 [标题, 说明]，
          整组再与动作行隔 44（那一层由 .cx-empty--page 的 gap 给）。
          我们原来是**一层扁平**结构 + 单一 gap ⇒ 三处全 44。
          只 page 档换结构：column / center 两档 DOM 保持原样 ⇒ 其余调用方零漂移。
          ⚠️ 不靠负 margin：两侧都必须是真 flex 容器（下方两条 CSS）。 */}
      {layout === "page" ? (
        <div className="cx-empty__text-group">
          <span aria-hidden className="cx-empty__art">
            <Icon size={48} />
          </span>
          <div className="cx-empty__text-body">
            <Title className="cx-empty__title">{title}</Title>
            {description ? <p className="cx-empty__description">{description}</p> : null}
          </div>
        </div>
      ) : (
        <>
          <span aria-hidden className="cx-empty__art">
            <Icon size={layout === "column" ? 24 : 48} />
          </span>
          <Title className="cx-empty__title">{title}</Title>
          {description ? <p className="cx-empty__description">{description}</p> : null}
        </>
      )}
      {actions ? <div className="cx-empty__actions">{actions}</div> : null}
    </div>
  );
}

/* ── 骨架屏 ───────────────────────────────────────────────────────────────── */

/** 行骨架。官方 plugins 与 automations 的 loading 态都是同族脉冲条（`h-3 w-20 rounded bg-text/10`）。 */
export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="cx-page__list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="cx-row" key={index}>
          <span className="cx-row__icon cx-skeleton" style={{ background: "none" }}>
            <span className="cx-skeleton" style={{ width: 20, height: 20 }} />
          </span>
          <span className="cx-row__main">
            <span className="cx-skeleton" style={{ width: 160, height: 12 }} />
            <span className="cx-skeleton" style={{ width: 96, height: 10 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 徽章 ─────────────────────────────────────────────────────────────────── */

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className="cx-badge" data-tone={tone}>
      {children}
    </span>
  );
}

/**
 * 资源行 / 资源网格（官方 /plugins 目录行语汇）。
 *
 * 无边框行：32px 带边框图标块 + 15px 标题 + 13px 描述（单行省略）+ 右侧 meta/动作；
 * 网格两列（窄窗单列）。出处见 pages.css 的 `.cx-res-grid` 注释与官方运行截图。
 */
export function ResourceRow({
  icon,
  title,
  description,
  meta,
  action,
  onClick,
  titleAttr,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  titleAttr?: string;
}) {
  return (
    <button className="cx-res-row" onClick={onClick} title={titleAttr ?? title} type="button">
      <span aria-hidden className="cx-res-row__icon">
        {icon}
      </span>
      <span className="cx-res-row__main">
        <span className="cx-res-row__title">{title}</span>
        {description ? <span className="cx-res-row__desc">{description}</span> : null}
      </span>
      {meta ? <span className="cx-res-row__meta">{meta}</span> : null}
      {action ? <span className="cx-res-row__action">{action}</span> : null}
    </button>
  );
}

export function ResourceGrid({ children }: { children: ReactNode }) {
  return <div className="cx-res-grid">{children}</div>;
}
