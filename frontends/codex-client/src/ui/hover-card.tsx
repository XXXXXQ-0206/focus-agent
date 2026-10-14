import { HoverCard as HoverCardPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

/**
 * 悬停卡片：与 Popover 同款表面（--popover-radius 20px + 发丝环 + --shadow-xl）。
 * 官方未采到 hover-card 几何（SPEC §15 缺口 3），故几何取 popover 同档，
 * 延迟沿用 Radix 默认（openDelay 700ms / closeDelay 300ms）。
 */
export function HoverCardContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        className={cn("cx-hover-card__content", "cx-anim", className)}
        sideOffset={sideOffset}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
