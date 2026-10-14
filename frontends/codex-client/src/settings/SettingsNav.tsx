import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/ui";

import {
  filterSettingsNav,
  SETTINGS_SEARCH_ARIA_LABEL,
  SETTINGS_SEARCH_EMPTY,
  SETTINGS_SEARCH_PLACEHOLDER,
} from "./nav-model";
import "./settings.css";

/**
 * 设置导航（渲染在侧栏面板里）。
 *
 * 侧栏面板本身归 cx-shell —— 本组件只负责「设置导航」这一块：
 *   `<SettingsNav />` 直接塞进面板的滚动区即可（纵向内距由面板滚动区给）。
 *
 * ★ 几何（SPEC §2 实测，@1280×816）：
 *   搜索框 **272×36** · 圆角 9999 · bg rgba(255,255,255,.08) · padding 0 12px · 14px/430
 *   分组标题 **30 高**（padding 0 6px 0 8px，文字 68,149 248×21 = 14px/500/21，色 text-tertiary）
 *   标题→列表 gap **4**；组间 gap **16**
 *   条目 **30 高** · 圆角 **12.5** · padding 5px 8px · **14px/400/21** · 列表内 gap **1**（步进 **31**）
 *   条目图标 x=**68**（= 条目 x60 + 内距 8）、16×16；条目文字 x=**92**（= 68 + 16 + gap 8）
 *   选中底 rgba(255,255,255,.08)；未选中透明；选中时图标加 text-codex-icon-active
 *
 * ⚠️ 横向内距归宿主：面板滚动区/分区容器已有 8px（官方
 *   `_header_cpwja_2 { padding: 0 8px }` 与导航滚动区 `padding: 4px 8px 8px` 是同一个 8px），
 *   所以本组件**不再自带横向 padding** —— 否则搜索框会变成 68/x=256 宽（旧实现的偏差）。
 * ⚠️ 纵向绝对位置：官方把搜索框放在**面板头**里（y=96），首个分组标题在 y=144；
 *   本工程由 cx-shell 把导航整体放进滚动区，所以搜索框与分组标题会一起下移
 *   （宿主的滚动区 padding-top 4px 之后即是导航内容起点）。条目本身的高度/步进不受影响。
 */
export function SettingsNav({
  className,
  onNavigate,
  defaultQuery = "",
  showSearch = true,
  query: controlledQuery,
}: {
  className?: string;
  /** 点条目后的回调（移动端收起面板 / 关闭弹层用） */
  onNavigate?: () => void;
  defaultQuery?: string;
  /**
   * 是否渲染自带的搜索框（默认 true）。
   *
   * 官方把搜索框放在**面板头**（y=96，独立于滚动区），所以宿主若自己画搜索框，
   * 传 `showSearch={false}` + `query=` 即可复用本组件的分组标题与条目几何
   * —— cx-shell 的 SidebarPanel 就是这么接的（它自己画搜索框，数据仍走 nav-model）。
   */
  showSearch?: boolean;
  /** 受控查询词（与 showSearch={false} 搭配；不传则用组件内部 state） */
  query?: string;
}) {
  const [innerQuery, setInnerQuery] = useState(defaultQuery);
  const query = controlledQuery ?? innerQuery;
  const groups = filterSettingsNav(query);
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setInnerQuery(event.target.value),
    [],
  );

  return (
    <div className={cn("cx-settings-nav", className)}>
      {showSearch ? (
        <Input
          aria-label={SETTINGS_SEARCH_ARIA_LABEL}
          className="cx-settings-nav__search"
          leading={<Search aria-hidden size={16} />}
          onChange={handleChange}
          pill
          placeholder={SETTINGS_SEARCH_PLACEHOLDER}
          type="search"
          value={query}
        />
      ) : null}

      {groups.map((group) => (
        <nav
          aria-label={group.label}
          className="cx-settings-nav__group"
          data-additional={group.additional ? "" : undefined}
          key={group.id}
        >
          <h2 className="cx-settings-nav__group-title">{group.label}</h2>
          <div className="cx-settings-nav__list">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className="cx-settings-nav__item"
                  key={item.slug}
                  onClick={onNavigate}
                  title={item.description}
                  to={item.to ?? `/settings/${item.slug}`}
                >
                  <span className="cx-settings-nav__item-icon">
                    <Icon aria-hidden size={16} />
                  </span>
                  <span className="cx-settings-nav__item-label">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      ))}

      {groups.length === 0 ? <p className="cx-settings-nav__empty">{SETTINGS_SEARCH_EMPTY}</p> : null}
    </div>
  );
}
