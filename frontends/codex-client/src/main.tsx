import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";

/**
 * 窗口类型必须是**官方桌面档 `electron`**（2026-10-15 修复）。
 *
 * 事故：这里此前写的是自造的 `"artex"`。官方 CSS 的窗口档只有 `electron` 与 `browser` 两个值
 * （tokens.css:49 / :58），本工程 `styles/theme.css` 的「3. Electron 档 · 结构性 token」也挂在
 * `:root[data-codex-window-type="electron"]` 上 —— 自造值两者都不命中，于是整档 token 变成空：
 *   · `--menu-background-color` / `--menu-box-shadow` 无值 ⇒ **Select / 下拉菜单弹层透明、无阴影**
 *     （用户 2026-10-15 报的「展开列表没有背景」）；
 *   · `--text-sm` 停留在基础档 12px（官方桌面实测 13px）、`--menu-gutter` 6px（官方 4px）、
 *     `--menu-item-padding` 8px 12px（官方 5px 8px）、`--menu-item-radius` 19px（官方 15px）……
 * 本工程参考端与全部实测数据都取自官方桌面端（captures/tokens.runtime.json），
 * 所以正确取值是 `electron`；浏览器托管时也仍按桌面档渲染（本工程只有一套 UI）。
 */
document.documentElement.setAttribute("data-codex-window-type", "electron");
document.documentElement.setAttribute("data-codex-os", "win32");
document.documentElement.setAttribute("data-theme", "dark");
document.documentElement.lang = "zh-CN";

const root = document.getElementById("root");
if (!root) throw new Error("ARTEX renderer missing #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
