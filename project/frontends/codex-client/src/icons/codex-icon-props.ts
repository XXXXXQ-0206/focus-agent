/**
 * Focus · Focus Desktop 官方图标 · 公共 props 类型
 * =====================================================================
 * 生成文件，请勿手改。类型定义与参考端逐字节一致，仅抽出为独立文件供 11 个域文件共享。
 * 约定：{ className?, size? } + SVGProps<SVGSVGElement>；根元素固定 fill="currentColor" /
 *       aria-hidden="true" / focusable="false"；viewBox 保持官方原值。
 * 逐字节校验：node src/icons/verify-icons.mjs
 * 来源：Focus Desktop renderer icon source
 */
import type { SVGProps } from "react";

export type CodexIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox" | "fill"> & {
  /** 追加 class（用于 tailwind 着色 / 尺寸覆盖） */
  className?: string;
  /** 图标高度（px），宽度按官方 viewBox 比例推导；默认 = 官方画布高度 */
  size?: number;
};
