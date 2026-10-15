import { type ComponentPropsWithoutRef, type Ref } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { RAIL_BOTTOM_ITEMS, RAIL_PRIMARY_ITEMS, RAIL_SECONDARY_ITEMS, type RailItem } from "./rail-items";

/**
 * 52px 图标导轨（官方 `nav.group/sidebar-rail`）。
 *
 * ── 几何（官方 capture 实测，captures/tree-rail.json + blocks-sidebar.json）──
 *   nav            [0,44 **52**×768]  padding-top calc((52-36)/2)=8  padding-bottom 4
 *   nav-list       [6,50 **40**×716]  margin -2px / padding 2px / gap 8px
 *   按钮           [8,52/96/140/184/236.67 **36×36**]  图标 20×20 居中
 *                  radius **12.5px**  corner-shape **superellipse(1.5)**
 *   分隔线         [14,228 **24×0.67**]
 *   底部组         [8,772 36×36]
 *
 * ── 元素形态：官方是 `button`，**不是** `<a>`（task-25 收口的真差异）──────
 * 原始取证 captures/tree-rail.json（同一份 DOM 树的属性转储）：
 * ```
 *   tag: "button"                                        ← 没有也不可能带 href
 *   cls: "_Button_eg66f_2 browser:[--button-text-color:var(--color-text-tertiary)]
 *         browser:data-selected:[--button-text-color:var(--color-text-primary-ghost)] …"
 *   dataAttrs: { data-color: "secondary", data-variant: "ghost", data-squircle: "",
 *                data-uniform: "", data-size: "xl", data-icon-size: "lg",
 *                data-sidebar-destination: "builtin:home",        // 首页
 *                data-slate-sidebar-peek-area: "home",
 *                data-state: "closed", data-selected: "" }        // ← 选中态
 *   可访问名：**来自内部 sr-only 文本**（capture 的 aria 字段 = null 的 5 条都带 text「首页/定时任务/插件/探索/代码审查」）
 *   底部那条是例外：aria-label="打开个人资料菜单"（没有可见/隐藏文本），且带 id="radix-_r_17_"（popover 触发钮）
 * ```
 * `tree-rail.json` 整棵树里**没有任何 `aria-*` 属性**（grep 只匹配到 data-variant），
 * 即官方**没有** `aria-current`；选中态只由 `data-selected` 表达。
 *
 * 本工程的做法：**形态对齐官方**（`button` + `onClick` 路由），
 * 同时**额外保留** `aria-current="page"` 与 `aria-label`（官方用 sr-only 文本给可访问名，
 * 我们这条口径等价、更省一层 DOM）；另加官方的 `data-selected` 便于逐条对照。
 *
 * ⚠️ 契约变更（有意，非回归）：去掉真实 `href` 后，**中键新开 / 右键「在新标签页打开」不再可用**，
 * 这是官方行为（官方那条根本没有链接语义）。键盘可达性不受影响：`<button>` 可 Tab 聚焦、
 * Enter/Space 都会激活，与官方一致。
 *
 * ★ 2026-10-15（用户：「不要『探索』，全部移入左侧栏」）：
 *   1) 删掉「探索」popover 菜单轨条（RailExplore）与随之而来的 **HTML5 拖拽固定**机制
 *      （自定义 MIME `application/x-codex-rail-item` + `use-rail-pinned.ts` 的 localStorage
 *      持久化 + 右键「从侧栏移除」）。菜单本身没有了，条目全部常驻，拖拽与固定都失去意义；
 *      原菜单的 6 个目的地现在直接住在 `RAIL_SECONDARY_ITEMS`（分隔线之后那一组）。
 *      2) 侧栏开关**不在这里** —— 它住在顶部菜单栏的左簇（[74,4 28×28]，见 AppMenuBar.tsx）。
 *      当天一度因为误删菜单栏而临时搬到本导轨底部，菜单栏恢复后已经搬回去了；
 *      底部组保持与上游一致：只有「设置」齿轮。
 */

/**
 * 选中判定（NavLink 默认语义的 `end=false`：完全相等，或落在它的子路径上），
 * 外加条目自己声明的 `alsoActiveOn` 前缀（见 RailItem 注释：设置齿轮在 /controls 上也要亮）。
 */
function isRailItemActive(pathname: string, item: RailItem) {
  const hits = (to: string) => pathname === to || pathname.startsWith(to.endsWith("/") ? to : `${to}/`);
  return hits(item.to) || (item.alsoActiveOn ?? []).some(hits);
}

/**
 * 导轨上的一枚 36×36 图标按钮。
 *
 * `ref` 走 **React 19 的 ref-as-prop**（本工程 React 19.3，全仓不用 `forwardRef`）。
 */
function RailItemButton({
  className,
  item,
  ref,
  ...rest
}: { item: RailItem; ref?: Ref<HTMLButtonElement> } & ComponentPropsWithoutRef<"button">) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const Icon = item.icon;
  const IconActive = item.iconActive;
  const active = isRailItemActive(pathname, item);
  const Glyph = active && IconActive ? IconActive : Icon;
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn("codex-rail__item", active && "is-active", className)}
      data-rail-id={item.id}
      data-selected={active ? "" : undefined}
      onClick={() => navigate(item.to)}
      ref={ref}
      title={item.label}
      type="button"
      {...rest}
    >
      <Glyph size={20} />
    </button>
  );
}

function RailButton({ className, item }: { className?: string; item: RailItem }) {
  return <RailItemButton className={className} item={item} />;
}

export function SidebarRail({ className }: { className?: string }) {
  return (
    <nav aria-label="主导航" className={cn("codex-rail", className)} data-app-navigation-rail="true">
      <div className="codex-rail__list">
        {RAIL_PRIMARY_ITEMS.map((item) => (
          <RailButton item={item} key={item.id} />
        ))}
        {/* 分隔线只在它后面真有条目时才画（2026-10-15：次轴组接住原「探索」菜单的 6 个目的地） */}
        {RAIL_SECONDARY_ITEMS.length > 0 ? (
          <div aria-hidden className="codex-rail__divider" />
        ) : null}
        {RAIL_SECONDARY_ITEMS.map((item) => (
          <RailButton item={item} key={item.id} />
        ))}
      </div>

      <div className="codex-rail__bottom">
        {RAIL_BOTTOM_ITEMS.map((item) => (
          // [task-55] 去掉死类名 codex-rail__item--bottom：CSS 从无该规则；底部槽布局由父级
          // .codex-rail__bottom、条目几何由 RailButton 自带的 .codex-rail__item 承担。
          <RailButton item={item} key={item.id} />
        ))}
      </div>
    </nav>
  );
}
