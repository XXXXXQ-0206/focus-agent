import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive.Root>;

/**
 * 单选组。
 *
 * 证据（官方 token，shell-shared:3987-3997）：
 *   行间距 --radio-group-row-gap（20px）、列间距 --radio-group-col-gap（10px）、
 *   项内箭头 --radio-group-item-gap（6px）、指示器 16px、
 *   孔 --radio-group-indicator-hole-size（6px）、选中底 --color-background-primary-solid。
 * 方向键导航由 Radix 提供（roving tabindex）；
 * 未选中项在 Tab 顺序里只占一个停靠点（本组内）。
 */
export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadioGroupPrimitive.Root className={cn("cx-radio-group", "cx-anim", className)} {...props} />;
}

export interface RadioItemProps extends ComponentProps<typeof RadioGroupPrimitive.Item> {
  label: string;
}

export function RadioItem({ className, label, ...props }: RadioItemProps) {
  return (
    <RadioGroupPrimitive.Item className={cn("cx-radio-item", className)} {...props}>
      <span className="cx-radio-item__indicator">
        <RadioGroupPrimitive.Indicator className="cx-radio-item__hole" />
      </span>
      <span>{label}</span>
    </RadioGroupPrimitive.Item>
  );
}
