import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export interface KbdProps extends ComponentProps<"kbd"> {
  /**
   * default —— 官方 ShortcutKeys 默认档：48×16、圆角 10px、白 10% 底、12px/430、
   *            行高 12、padding 2px 6px
   * button  —— 官方 data-variant=button：40×16 起、leading 16
   * tooltip —— 官方 tooltip 档：18 高、--radius-lg、tooltip-shortcut 配色
   */
  size?: "default" | "button" | "tooltip";
  variant?: "default" | "primary";
}

/**
 * 快捷键键帽。
 *
 * 证据：官方 ShortcutKeys 组件（app-shared-40678a67f0e3.js）：
 *   `inline-flex !border-0 !font-sans !shadow-none` +
 *   默认档 `!rounded-md !bg-current/10 !text-xs !text-current` + `!px-1.5 !py-0.5 !leading-none`
 *   → 圆角 = --radius-md（×1.25 = 10px）、底 = currentColor 10%、
 *     字号 = --text-xs 12px、行高 = 1（12px）、padding 2px 6px、高度 16px。
 * 实测量：Ctrl+C 档 48×16（SPEC 交办值）。
 */
export function Kbd({ className, size = "default", variant = "default", ...props }: KbdProps) {
  return (
    <kbd aria-hidden className={cn("cx-kbd", className)} data-size={size} data-variant={variant} {...props} />
  );
}

/** 把 "Ctrl+Shift+S" 这类标签拆成多个键帽 */
export function KbdChord({ chord, className }: { chord: string; className?: string }) {
  const keys = chord.split("+").map((part) => part.trim());
  return (
    <span className={cn("cx-kbd-chord", className)} style={{ display: "inline-flex", gap: "3px" }}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
