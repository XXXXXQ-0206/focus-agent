/**
 * ARTEX · Codex Desktop 官方图标集（统一出口）
 * =====================================================================
 * 161 个逐字节复刻的官方图标组件，按 11 个域拆分在同目录的 *.tsx 里；
 * 另含 CodexReviewLogo（官方 <mask><image> 结构，单独一文件原样复刻）
 * 与 CODEX_ICON_NAMES（官方 1031 个图标名索引）。
 *
 * 来源代号：official-catalog 官方图标目录 J({ name, canvas, body })；
 *           reference-runtime 参考端运行时 DOM 实拍；official-source 官方 index.html 内联 SVG。
 * 约定：props { className?, size? }；根元素 fill="currentColor" / aria-hidden="true" / focusable="false"；
 *       viewBox 保持官方原值；不发起任何网络请求、不引入新依赖。
 *
 * 逐字节校验：node src/icons/verify-icons.mjs
 * 来源：Codex Desktop renderer icon source
 */

export * from "./brand";
export type { CodexIconProps } from "./codex-icon-props";
export * from "./composer";
export * from "./conversation";
export * from "./git";
export * from "./misc";
export { CODEX_ICON_NAMES, type CodexIconName } from "./official-names";
export * from "./rail";
export * from "./reasoning";
export * from "./review-logo";
export * from "./settings-nav";
export * from "./sidebar";
export * from "./tools";
export * from "./topbar";
