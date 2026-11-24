import { Menubar } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { CodexArrowLeft, CodexArrowRight, CodexSidebar, CodexSidebarHidden } from "@/icons";
import { APP_MENUS } from "./app-menus";
import { desktop } from "./desktop-bridge";
import { useSidebar } from "./use-sidebar";

/**
 * 顶部 36px 应用菜单栏。
 *
 * 参考端是 **DOM 自绘**（不是 Electron 原生菜单），且**就是 Radix Menubar**：
 * <html data-codex-window-chrome="application-menu">，DOM 为
 * div[role=menubar] > button[role=menuitem]#application-menu-trigger-{file,edit,view,help}-menu
 * + portal 里的 div[role=menu]#application-menu-content
 *   （data-side=bottom data-align=start data-radix-menubar-content="" —— Radix 特有属性，
 *     且 content 的 max-height/min-width/--radix-* 变量全是 Radix 生成）。
 * 因此这里直接用同一套 Radix Menubar，键盘行为（Alt 激活 / ←→ 换菜单 / ↑↓ 选项 /
 * Enter 执行 / Esc 关闭并归还焦点）与参考端一致，不需要手写一套自己的。
 *
 * 几何（实测 @1280×816，captures/views-topbar.json + views-app-menu-*.json）：
 *   容器   [0,0 **1276**×**36**]  padding `0 0 0 6px`  bg 透明（外壳底色 rgb(40,40,40) 透出）
 *   左簇   [6,4 **102**×28]  gap 6px（首页/会话态）
 *            导航组 [6,4 62×28] gap 6px（两个 **28×28** 图标按钮：返回 / 前进）
 *            侧栏组 [74,4 28×28] + margin-inline-end 6px
 *            （6 + 62 + 6 + 28 + 6 = 108 ✓）
 *   menubar[108,6 215.33×23.33]  padding `0 8px 0 4px`  gap **2px**
 *
 * ★ **设置态左簇只有 62 宽**（FIDELITY-AUDIT #77 #78 / [C02]）：
 *   captures/views-settings.json 的 childrenSummary 实测左簇 `[6,4 **62**×28]`（gap 6px）+
 *   menubar `[**68**,6.333 215.33×23.33]` —— 即设置态**不渲染「隐藏侧边栏」那一组**
 *   （62 = 28 + 6 + 28，只剩返回/前进），menubar 随之左移到 68（= 6 + 62）。
 *   参考截图 reference-shots/ref-09-settings.png 的左上角可肉眼复核：← → 之后直接就是「文件」。
 *   首页/会话态仍是 102（views-topbar.json + ref-01-chat-home.png 三钮齐全）。
 *   ⚠️ 只对 /settings** 实测过；其余路由沿用 102 口径。
 *   触发钮  [112,6 **49.33×23.33**]  padding `4px 10px`  字号 **14px/14px/400**
 *           圆角 **10px**（--radius-md）  cs superellipse(1.5)  色 rgba(255,255,255,.498)
 *           hover / 展开：bg rgba(255,255,255,.03) + 色 #dfdfdf
 *           x 步进 = 49.33 + 2 → 112 / 163.33 / 214.67 / 266
 *   下拉   y = **30**（= 触发钮底边 6+24），x = 触发钮 x
 *
 * ⚠️ dpr 口径：参考端量到的按钮高是 23.333px，因为 Chromium 在 dpr=1.5 下把
 * 1px 边框按设备像素向下取整成 0.666667px（同份 capture 里 UA 焦点环
 * outline-width = 2.66667px = 4/1.5 可互证）。官方作者值是 1px 边框，本工程按
 * 作者值实现 → 触发钮 49.33×**24**、y=**6**，菜单仍然落在 y=30，与 SPEC 一致。
 *
 * ★ 2026-10-15：本组件曾被我**误删**（把「Windows 自带标题栏」与「应用自己的菜单栏」
 *   看串了），随后按构建产物里恢复出的源码原样还原；同日用户澄清后，桌面端改为
 *   **隐藏 Windows 标题栏**（desktop/main.js 的 titleBarStyle:"hidden" + titleBarOverlay），
 *   于是这条 36px 菜单栏就成了窗口最顶上的一条 —— 与 reference-shots/ref-01-chat-home.png
 *   里官方窗口的形态一致，它同时也是窗口的拖拽区（`codex-drag-region`）。
 */
export function AppMenuBar() {
  const { collapsed, narrow, toggle } = useSidebar();
  const [openMenu, setOpenMenu] = useState<string>("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 设置态左簇少一组（#77 #78）：参考端设置页把「隐藏侧边栏」整组摘掉了，
  // 左簇 102 → 62，menubar 随之 108 → 68。见文件头 ★ 段的出处。
  const showSidebarToggle = !useLocation().pathname.startsWith("/settings");

  // Alt 激活：参考端 Alt 会打开「文件」菜单（Windows 惯例 + Radix Menubar 的激活语义）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || event.repeat || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // 已经打开时 Alt 收全部菜单
      event.preventDefault();
      setOpenMenu((current) => {
        if (current) return "";
        // Radix 会在 value 变更后把焦点交给菜单内容
        return APP_MENUS[0].id;
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="codex-app-menu-bar codex-drag-region" data-codex-app-menu-bar="" ref={rootRef}>
      {/* 左簇：后退 / 前进 + 侧栏开关 */}
      <div className="codex-app-menu-bar__cluster codex-no-drag">
        <div className="codex-app-menu-bar__nav">
          <button
            aria-label="返回"
            className="codex-icon-button"
            onClick={() => desktop.historyBack()}
            type="button"
          >
            <CodexArrowLeft size={16} />
          </button>
          <button
            aria-label="前进"
            className="codex-icon-button"
            onClick={() => desktop.historyForward()}
            type="button"
          >
            <CodexArrowRight size={16} />
          </button>
        </div>
        {/* 设置态整组不渲染（#77 #78）：不是 disabled、不是 visibility —— 参考端的
            左簇实测就是 62 宽（DOM 里没有这一组），所以这里不占位。 */}
        {showSidebarToggle ? (
          <div className="codex-app-menu-bar__sidebar">
            {/* 窄窗口（<900px）下侧栏是**强制**收起态：useSidebar 的 effective 恒为 collapsed，
                此时 toggle() 只改用户偏好、界面不会动 —— 不置 disabled 的话按钮看起来是坏的。
                官方窄窗行为是把左栏宽度直接压到 0（shell-initial.css:3131-3136），不存在展开。 */}
            <button
              aria-label={narrow ? "窗口过窄，侧边栏已自动收起" : collapsed ? "显示侧边栏" : "隐藏侧边栏"}
              className="codex-icon-button"
              disabled={narrow}
              onClick={toggle}
              title={narrow ? "窗口过窄，侧边栏已自动收起" : undefined}
              type="button"
            >
              {collapsed ? <CodexSidebarHidden size={16} /> : <CodexSidebar size={16} />}
            </button>
          </div>
        ) : null}
      </div>

      <Menubar.Root
        className="codex-app-menu-bar__menubar codex-no-drag"
        onValueChange={setOpenMenu}
        value={openMenu}
      >
        {APP_MENUS.map((menu) => (
          <Menubar.Menu key={menu.id} value={menu.id}>
            <Menubar.Trigger
              className="codex-app-menu-bar__trigger"
              id={`application-menu-trigger-${menu.id}-menu`}
            >
              {menu.label}
            </Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content
                align="start"
                /* 触发钮用的是官方 id（#application-menu-trigger-*-menu，SPEC §4 实测），
                   Radix 内部的 triggerId 指向它自己生成的 id，会把 aria-labelledby 指空 —— 显式指回来 */
                aria-labelledby={`application-menu-trigger-${menu.id}-menu`}
                className="codex-app-menu"
                id="application-menu-content"
                side="bottom"
                sideOffset={0}
                style={{ minWidth: menu.width }}
              >
                {menu.items.map((entry, index) =>
                  entry.type === "separator" ? (
                    <Menubar.Separator className="codex-app-menu__separator" key={`sep-${index}`} />
                  ) : (
                    <Menubar.Item
                      className="codex-app-menu__item"
                      data-menu-item-id={entry.id}
                      disabled={entry.disabled}
                      key={entry.id}
                      onSelect={() => entry.run?.()}
                    >
                      <span className="codex-app-menu__label">{entry.label}</span>
                      {entry.accelerator ? (
                        <span className="codex-app-menu__accelerator">{entry.accelerator}</span>
                      ) : null}
                      {entry.submenu ? (
                        <CodexArrowRight className="codex-app-menu__chevron" size={16} />
                      ) : null}
                    </Menubar.Item>
                  ),
                )}
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        ))}
      </Menubar.Root>
    </div>
  );
}
