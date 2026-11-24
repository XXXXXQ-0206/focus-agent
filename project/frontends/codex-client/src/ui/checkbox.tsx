import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

/**
 * 复选框。
 *
 * 证据：官方 _Checkbox_1mw3n_2（官方CSS raw/1mw3n.css:5-21，SPEC-INTERACTION §4）
 *   方框 18×18、border 1px solid --gray-500、圆角 --radius-xs（= 5px，×1.25 后）、
 *   checked/indeterminate 边+底 --gray-900、focus-visible outline 2px --color-ring offset 2px、
 *   disabled 边 --gray-300 底 --gray-200。
 * 勾不是图标：官方 _CheckMark_ 用两笔伪元素（本体 rotate(-45deg) translate(-10%,100%)，
 *   竖笔 2px + 横笔 2px，色 --gray-0），所以这里只渲染空的 Indicator 容器，由 ui.css 画。
 * Radix 负责键盘与 aria；Indicator 只在 checked / indeterminate 时挂载。
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root className={cn("cx-checkbox", "cx-anim", className)} {...props}>
      <CheckboxPrimitive.Indicator className="cx-checkbox__indicator" />
    </CheckboxPrimitive.Root>
  );
}
