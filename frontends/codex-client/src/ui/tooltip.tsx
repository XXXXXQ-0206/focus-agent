import { Tooltip as TooltipPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/** 打开提示时派发的全局事件（bundle app-shared-40678a67f0e3.js@1409574）。 */
export const TOOLTIP_OPEN_EVENT = "tooltip.open";

/** 全局关闭提示的事件名（bundle app-shared-40678a67f0e3.js@7934719）。 */
export const TOOLTIP_DISMISS_EVENT = "codex:dismiss-tooltips";

/** 让所有 tooltip 立刻收起（官方在 window 上监听 codex:dismiss-tooltips）。 */
export function dismissTooltips(): void {
  window.dispatchEvent(new Event(TOOLTIP_DISMISS_EVENT));
}

/**
 * Tooltip provider。
 *
 * 时延证据（SPEC-OVERLAYS §6.5）：
 *   · Radix TooltipProvider 自带默认 delayDuration = 700ms / skipDelayDuration = 300ms
 *   · 官方**应用自有** provider 的默认值是 delayDuration = 200ms
 *     （bundle app-shared-40678a67f0e3.js@7934719：`a10 = n10 === void 0 ? 200 : n10`）
 * 应用里的提示气泡走的是后者，所以这里默认 200ms；要 Radix 原生手感就显式传 700。
 */
export function TooltipProvider({
  delayDuration = 200,
  skipDelayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

/**
 * Tooltip 根：在 Radix Root 上补两件官方行为（SPEC-OVERLAYS §6.5）
 *   1) 打开时 `document.dispatchEvent(new CustomEvent("tooltip.open"))`
 *   2) 监听 `window` 的 `codex:dismiss-tooltips` 并立即收起
 * 其余（hover / focus 立即开、Esc 关、disableHoverableContent=false 可移入内容区）交给 Radix。
 */
export function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const controlled = open !== undefined;

  useEffect(() => {
    const dismiss = () => {
      if (!controlled) setUncontrolledOpen(false);
      onOpenChange?.(false);
    };
    window.addEventListener(TOOLTIP_DISMISS_EVENT, dismiss);
    return () => window.removeEventListener(TOOLTIP_DISMISS_EVENT, dismiss);
  }, [controlled, onOpenChange]);

  return (
    <TooltipPrimitive.Root
      defaultOpen={defaultOpen}
      onOpenChange={(next) => {
        if (!controlled) setUncontrolledOpen(next);
        onOpenChange?.(next);
        if (next) document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT));
      }}
      open={controlled ? open : uncontrolledOpen}
      {...props}
    />
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * 提示气泡。
 *
 * 证据（官方CSS shell-shared.css:771-806 + token 4032-4047，SPEC-OVERLAYS §6）：
 *   圆角 10px（--tooltip-border-radius = --radius-md）
 *   底 rgba(54,54,54,.96)（--tooltip-background-color = --color-surface-elevated）
 *   字 #dfdfdf / 14px / weight 400 / 行高 1.45
 *   padding 三档：sm 8px 12px / md 12px 16px / lg 14px 18px；compact 2px 8px（底 --gray-700、字 --gray-0）
 *   最大宽 300px；光标按 data-clickable；**没有** reduced-motion 分支。
 * ⚠️ 几何未实测：tooltip 是 hover 触发，参考端 captures 里 [role=tooltip] 命中 0（SPEC-OVERLAYS §15 第 1 条）。
 */
export interface TooltipContentProps extends ComponentProps<typeof TooltipPrimitive.Content> {
  gutterSize?: "sm" | "md" | "lg";
  compact?: boolean;
  /** 内容可点（官方 [data-clickable]：true → cursor pointer + compact hover 换底） */
  clickable?: boolean;
  children?: ReactNode;
}

export function TooltipContent({
  className,
  gutterSize = "md",
  compact,
  clickable,
  sideOffset = 6,
  children,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn("cx-tooltip__content", "cx-anim", className)}
        data-clickable={clickable ? "true" : undefined}
        data-compact={compact ? "true" : undefined}
        data-gutter-size={gutterSize}
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** 常用组合：把子元素直接包成「悬停/聚焦出 tooltip」 */
export function WithTooltip({
  label,
  children,
  gutterSize,
}: {
  label: ReactNode;
  children: ReactNode;
  gutterSize?: "sm" | "md" | "lg";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent gutterSize={gutterSize}>{label}</TooltipContent>
    </Tooltip>
  );
}
