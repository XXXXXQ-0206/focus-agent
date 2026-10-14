import { useEffect } from "react";

/**
 * 补齐官方 <html> 上的窗口属性（**FIDELITY-AUDIT #129 / §2.5 / [C81]**，SPEC §1）。
 *
 * 参考端实测（views-settings.json / SPEC §1）：
 *   lang=zh-CN data-theme=dark **data-codex-window-type=electron** **data-window-type=electron**
 *   data-codex-os=win32 **data-codex-window-chrome=application-menu** data-reduced-motion=false **dir=ltr**
 *
 * 本工程现状（[C81]）：lang=zh-CN data-build=reconstructed data-theme=dark data-reduced-motion=false
 *   data-sidebar-state=expanded data-codex-window-type=electron data-codex-os=win32 class=dark
 *   → 缺 **data-window-type / data-codex-window-chrome / dir** 三个。
 *
 * ⚠️ 为什么敢加（token 一致率是硬门槛，见 tools/verify.mjs §B）：
 *   · `data-window-type`（**不带 codex-** 前缀）在官方发行 CSS（captures/css-pretty/*.css）
 *     里 **0 处命中** —— 纯 DOM 记账属性，没有任何选择器依赖它；
 *   · `data-codex-window-chrome=application-menu` 在官方 CSS 里只命中 **1 条**：
 *     `shell-initial.css: :root[data-codex-window-chrome=application-menu] ._SelectedSurface_p64dj_1`
 *     —— 只改那个组件的两个局部变量（--color-border / --tw-shadow-color），**不是 token 档位选择器**；
 *   · 搬运过来的 tokens.css 里搜不到 window-chrome / window-type 字样（0 处），
 *     即 `--app-color-*` 家族不按这两个属性分档。
 *   加完用 `node tools/verify.mjs` 复测：token 一致率 100% → 100%（未退化）。
 *
 * ⚠️ data-codex-window-type / data-codex-os / lang 已经由 src/main.tsx（非本包写范围）在
 *   模块求值阶段打好，这里**不重复设置**，只补缺的三个。
 *
 * 放在 useEffect 里而不是模块顶层：这三个属性对首帧样式无影响（官方 CSS 未按其分档），
 * 挂在 AppShell 上可以保证「外壳存在即属性存在」，也不会在 import 阶段产生副作用。
 */
export function useWindowChromeAttributes(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-window-type", "electron");
    root.setAttribute("data-codex-window-chrome", "application-menu");
    root.setAttribute("dir", "ltr");
  }, []);
}
