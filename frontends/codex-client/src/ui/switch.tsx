import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  /**
   * 尺寸档（官方两套，尺寸不同、不要统一，SPEC-INTERACTION §3.1/§3.2）：
   *   "menu"（默认）= 菜单内 _SwitchIndicator_12y2s_2：轨道 32×19、thumb 13px、内缩 3px，
   *                过渡 inset-inline-start .25s var(--cubic-move)
   *   "settings"  = 设置页实测档：轨道 32×20、thumb 16px、内缩 2px（关 2px → 开 14px），
   *                过渡 duration-basic + ease-out（Tailwind transition-colors/transform）
   */
  size?: "menu" | "settings";
};

/**
 * 开关。
 *
 * 证据（官方 token，shell-shared:4011-4031 / raw/12y2s.css:52-62）：
 *   轨道 --switch-track-width 32px / --switch-track-height 19px（菜单档）；
 *   滑块 --switch-thumb-size = calc(19px − 2×3px) = 13px、内缩 --switch-thumb-offset 3px、
 *   开态位移 = 32 − 13 − 3 = 16px；底/滑块色走 --switch-track-color* / --switch-thumb-color*。
 * 交互态：hover（菜单里也可用 data-highlighted 驱动）/ checked / focus-visible（2px --color-ring）/
 *   disabled 齐全。官方 Switch **没有** reduced-motion 分支（SPEC-INTERACTION §3.3），故本件也不加。
 */
export function Switch({ className, size = "menu", ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root className={cn("cx-switch", "cx-anim", className)} data-size={size} {...props}>
      <SwitchPrimitive.Thumb className="cx-switch__thumb" />
    </SwitchPrimitive.Root>
  );
}

/**
 * 开关 + 文字标签（官方 --switch-label-gap = 8px）。
 * Radix Switch 渲染的是 `<button role="switch">` 而不是 input，所以用 aria-label 关联语义，
 * 不使用 <label for>；文字是可见标签，点击文字不切换（与官方一致）。
 */
export function SwitchField({ label, className, ...props }: SwitchProps & { label: string }) {
  return (
    <span className={cn("cx-switch-label", className)}>
      <Switch aria-label={label} {...props} />
      <span>{label}</span>
    </span>
  );
}
