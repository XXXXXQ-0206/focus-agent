import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/** 官方 _Container_1pj83_2 的 9 档（官方CSS shell-initial.css:4523-4591）。默认档 sm 之外的档位与官方同名。 */
export type InputSize = "3xs" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: InputSize;
  /** outline = 1px 内描边（官方默认）；soft = --input-soft-background-color 底 */
  variant?: "outline" | "soft";
  /** 药丸（设置页搜索框 36 高药丸用 data-pill + data-size="md"） */
  pill?: boolean;
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

/**
 * 单行输入。
 *
 * 证据：官方 _Container_1pj83_2（shell-initial:4476-4600）+ token --input-*
 *   · 高度 = --input-size，字号 = --input-font-size，圆角 = --input-radius，
 *     内距 = --input-gutter —— 全部按 data-size 取档（sm/md/lg 用 --control-radius-md，
 *     xl 用 --control-radius-lg，与官方表一致）
 *   · outline 变体：inset 1px --input-outline-border-color，hover --alpha-25/30，
 *     focus --alpha-50（shell-shared:3907-3909）
 *   · placeholder：--input-placeholder-text-color（= --color-text-tertiary）
 *   · 键盘焦点另加 2px --color-ring 外环（可达性要求，不动官方视觉焦点态）
 */
export function Input({
  className,
  size = "sm",
  variant = "soft",
  pill,
  invalid,
  leading,
  trailing,
  disabled,
  ...props
}: InputProps) {
  return (
    <span
      className={cn("cx-input", "cx-anim", className)}
      data-disabled={disabled ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      data-pill={pill ? "" : undefined}
      data-size={size}
      data-variant={variant}
    >
      {leading ? <span className="cx-input__adornment">{leading}</span> : null}
      <input className="cx-input__control" disabled={disabled} {...props} />
      {trailing ? <span className="cx-input__adornment">{trailing}</span> : null}
    </span>
  );
}
