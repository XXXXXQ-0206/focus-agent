import { Navigate, useParams } from "react-router-dom";

import { SettingsBadge } from "./controls";
import { DEFAULT_SETTINGS_SECTION, findSettingsSection } from "./nav-model";
import { SETTINGS_PANES } from "./panes";
import { AboutSection } from "./sections/AboutSection";
import { GeneralSection } from "./sections/GeneralSection";
import "./settings.css";

/**
 * 分区路由：专用页面 3 个（常规 / 自定义 API / 关于）+ ./panes 注册表里的其余分区
 * （插件 / 连接 / 归档 / ARTEX 服务端四项）。
 *
 * ⚠️ 2026-10-14：官方 18 项按用户口径收敛为「常规 / 归档 / 键盘快捷键 / 插件 / 浏览器」五项
 * （+ ARTEX 服务端三项 + 附加项）；『外观』『键盘快捷键』先删后按用户复核恢复/并入。
 * ⚠️ 2026-10-15：原「连接」「上游连接」「流量与证据」三页合并为『连接与流量』
 * （见 nav-model.ts 的合并理由），旧 slug 在这里做重定向，书签不失效。
 */
/**
 * @param slug      归一化后的分区（未知 slug 已回落到默认分区）
 * @param rawSection URL 里的原始 :section —— 归一化会吞掉"已删除/已合并"的旧 slug，
 *                   所以旧深链的重定向必须在归一化**之前**判（否则 /settings/artex-traffic
 *                   会被静默渲染成「常规」，用户看到的是错页而不是跳转）。
 */
function renderSection(slug: string, rawSection?: string) {
  // 合并后的旧 slug：深链接重定向到「连接与流量」
  if (rawSection === "artex-traffic" || rawSection === "artex-connections") {
    return <Navigate replace to="/settings/connections" />;
  }
  // 「控件库」不是设置分区（它按用户口径是**素行**页、无卡片），实体路由在 /controls；
  // 手敲 /settings/controls 时不落回「常规」，直接送去那个页面。
  if (rawSection === "controls") {
    return <Navigate replace to="/controls" />;
  }
  // 2026-10-15：「LLM 配置」与「自定义 API」合并为「模型与 API」；旧深链重定向。
  if (rawSection === "llm" || rawSection === "api") {
    return <Navigate replace to="/settings/model-api" />;
  }
  switch (slug) {
    case "general":
      return <GeneralSection />;
    case "about":
      return <AboutSection />;
    default: {
      const Pane = SETTINGS_PANES[slug];
      return Pane ? <Pane section={slug} /> : <GeneralSection />;
    }
  }
}

/**
 * 设置页主体（挂在外壳主内容区里，路由 /settings/:section）。
 *
 * 几何（SPEC §2 / §2.1 + captures/blocks-settings.json 实测，@1280×816，主内容区 [340.67,…]）：
 *   顶部分隔空带 **46px**（div.flex.items-center.px-panel.draggable.electron:h-toolbar，无内容）
 *   滚动区       **340.67,90 935.33×722**，自身内距 0
 *   标题带外壳   **340.67,90 925.33×76.667** = 16（padding-top）+ 60（标题带）+ **0.667**（1px 底边
 *                `.cx-settings__shell`，官方 `_shell_bomwa_2`，shell-initial.css:3765-3771）
 *   页面标题带   **419,106 768×60**，padding 0 20px → 本页用 min-height 60 + padding 12px 20px
 *   页面 h1      **28px/500/33.6**（439,**119.2** 56×34）—— 注意左栏面板标题是 18px/600，别混用
 *   设置列       **419,166.67 768×2070**，padding 20px → 列内层 439,**186.67** 728×2030
 *   列内层分区间距 **40px**（div.flex.flex-col.gap-10）
 *   ★ 对应 FIDELITY-AUDIT #91/#92（[C52]）：h1 上沿必须是 **119.2**（44+46+16+13.2）。
 *   ★ 对应 FIDELITY-AUDIT #93/#94（[C53]）：列内层上沿必须是 **186.67**（= 166.67 + 20），
 *     它由上面那条 0.667 底边决定 —— 少了它 h2「权限」会落在 186、首卡落在 232。
 *   ⚠️ 官方内容页的标题带里**只有 h1**（没有 h1 下方的说明行）—— 本页此前多渲染了一行
 *      description，把标题带从 60 撑到 81.6，导致整列下移（#93/#94）。
 *      现在说明文案改为 h1 的 title 提示 + 左栏条目的 title（数据仍在 nav-model.ts）。
 * 滚动条占 10px，所以有滚动条时列 x=439 w=728，无滚动条时 x=444（居中）。
 * 侧栏里的设置导航由 SettingsNav 提供（数据模型 nav-model.ts，面板归 cx-shell）。
 */
export function SettingsPage() {
  const { section } = useParams();
  const item = findSettingsSection(section) ?? findSettingsSection(DEFAULT_SETTINGS_SECTION);
  const slug = item?.slug ?? DEFAULT_SETTINGS_SECTION;

  return (
    <div className="cx-settings" data-settings-section={slug}>
      <div aria-hidden="true" className="codex-drag-region cx-settings__dragbar" />
      <div className="cx-settings__scroll">
        {/* 官方 DOM 结构（blocks-settings.json）：
              scroll ▸ _shell_bomwa_2（padding-top 16 + 1px 底边）▸ _content_bomwa_2（768 居中）▸ _title_bomwa_2
              scroll ▸ div.group/settings（768 居中，padding 20px）← 内容列是**外壳的兄弟**，不在它里面
            FIDELITY-AUDIT #93/#94：把 16px 上内距与那条 1px（dpr1.5 → 0.667）底边一起挪进
            .cx-settings__shell，内容列才会落在 166.667 → 186.667（h2）→ 232.667（首卡）。 */}
        <div className="cx-settings__shell">
          <div className="cx-settings__page">
            <header className="cx-settings__header">
              <h1 className="cx-settings__title" title={item?.description}>
                {item?.label ?? "常规"}
              </h1>
              {item?.additional ? <SettingsBadge tone="warn">附加 · 官方无此分区</SettingsBadge> : null}
            </header>
          </div>
        </div>
        <div className="cx-settings__page">
          <div className="cx-settings__column">{renderSection(slug, section)}</div>
        </div>
      </div>
    </div>
  );
}
