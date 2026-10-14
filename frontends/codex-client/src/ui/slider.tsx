import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export interface SliderProps extends ComponentProps<typeof SliderPrimitive.Root> {
  "aria-label"?: string;
}

/**
 * 滑杆。
 *
 * 证据：官方 token --slider-track-color / --slider-range-color（shell-shared:4009-4010）；
 * 轨道 4px + --radius-full，滑块 12px 圆点（--color-background-primary-solid + 发丝描边）。
 * 键盘：←/→ 步进、Home/End 到端（Radix 内建）；focus-visible 2px --color-ring。
 */
export function Slider({ className, "aria-label": ariaLabel, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root className={cn("cx-slider", "cx-anim", className)} {...props}>
      <SliderPrimitive.Track className="cx-slider__track">
        <SliderPrimitive.Range className="cx-slider__range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={ariaLabel} className="cx-slider__thumb" />
    </SliderPrimitive.Root>
  );
}
