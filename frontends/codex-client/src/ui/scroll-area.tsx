import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export interface ScrollAreaProps extends ComponentProps<typeof ScrollAreaPrimitive.Root> {
  children?: ReactNode;
  viewportClassName?: string;
  viewportProps?: ComponentProps<typeof ScrollAreaPrimitive.Viewport>;
}

/**
 * 滚动区：官方滚动条 10px 宽、thumb 为 --color-text 16%（base.css 同款口径），
 * 这里用 Radix 自绘滚动条以便浮层里不被原生滚动条破坏圆角。
 */
export function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportProps,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root className={cn("cx-scroll-area", className)} type="hover" {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn("cx-scroll-area__viewport", viewportClassName)}
        {...viewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar className="cx-scroll-area__scrollbar" orientation="vertical">
        <ScrollAreaPrimitive.Thumb className="cx-scroll-area__thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar className="cx-scroll-area__scrollbar" orientation="horizontal">
        <ScrollAreaPrimitive.Thumb className="cx-scroll-area__thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
