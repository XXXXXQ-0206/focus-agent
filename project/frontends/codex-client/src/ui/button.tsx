import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/** 官方尺寸阶：data-size 3xs → 4xl 依次映射 --control-size-4xs(1.25rem) … --control-size-3xl(3rem) */
export type ButtonSize = "3xs" | "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
/** 官方 variant：solid（常显底）/ soft / surface / outline / ghost / transparent */
export type ButtonVariant = "solid" | "soft" | "surface" | "outline" | "ghost" | "transparent";
/** 官方 data-color：primary/secondary/danger/success/warning/caution/info/discovery */
export type ButtonColor = "primary" | "secondary" | "danger" | "success" | "warning";

export interface ButtonProps extends Omit<ComponentProps<"button">, "color"> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
  /** 只覆盖横向内距（官方 [data-gutter-size]，6/8/10/12/14/16px） */
  gutterSize?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
  /** 只覆盖图标尺寸（官方 [data-icon-size]，14/16/18/20/22/24px） */
  iconSize?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  /** 视觉对齐用的负外边距（官方 [data-optically-align=start|end]，pill 再乘 1.33） */
  opticallyAlign?: "start" | "end";
  /** 药丸（--radius-full，官方 [data-pill]） */
  pill?: boolean;
  /** 超椭圆角（官方 [data-squircle]，corner-shape: superellipse(1.5)） */
  squircle?: boolean;
  /** 满宽（官方 [data-block]） */
  block?: boolean;
  /** 正方形（官方 [data-uniform]：宽度 = 高度） */
  uniform?: boolean;
  /** 载入态：内容淡出 + 居中 spinner（官方 [data-loading]） */
  loading?: boolean;
  /** 用 Radix Slot 把样式交给子元素（做链接式按钮） */
  asChild?: boolean;
  children?: ReactNode;
}

/**
 * 按钮。
 *
 * 证据：
 *   · 高度/内距/字号/圆角阶 —— 官方 _Button_eg66f_2（shell-shared:43-284）
 *   · 主按钮底 --color-background-primary-solid（dark 实测 #dfdfdf，SPEC §11）
 *   · focus-visible: 2px var(--color-ring)，offset 2px（shell-shared:91-94）
 *   · disabled: [disabled] pointer-events:none / [data-disabled] cursor:not-allowed
 *     / ghost|transparent|dimmed → opacity .4（shell-shared:712-732）
 */
export function Button({
  className,
  size = "sm",
  variant = "ghost",
  color = "primary",
  gutterSize,
  iconSize,
  opticallyAlign,
  pill,
  squircle,
  block,
  uniform,
  loading,
  asChild,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  /**
   * asChild 分支：Radix Slot 只接受**单个元素子节点**（调用方给的是 <Link> 一类），
   * 不能再包 `.cx-btn__inner` / loader 两层 —— 包了 Slot 会报
   * 「Slot failed to slot onto its children」。className/data-* 由 Slot 合并到那个元素上；
   * `disabled` 对非表单元素是非法属性，这里换成 aria-disabled（视觉状态仍由 data-disabled 表达）。
   */
  if (asChild) {
    return (
      <Comp
        aria-disabled={disabled || undefined}
        className={cn("cx-btn", "cx-anim", className)}
        data-color={color}
        data-size={size}
        data-variant={variant}
        data-gutter-size={gutterSize}
        data-icon-size={iconSize}
        data-optically-align={opticallyAlign}
        data-pill={pill ? "" : undefined}
        data-squircle={squircle ? "" : undefined}
        data-block={block ? "" : undefined}
        data-uniform={uniform ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        {...props}
      >
        {children}
      </Comp>
    );
  }
  return (
    <Comp
      className={cn("cx-btn", "cx-anim", className)}
      data-color={color}
      data-size={size}
      data-variant={variant}
      data-gutter-size={gutterSize}
      data-icon-size={iconSize}
      data-optically-align={opticallyAlign}
      data-pill={pill ? "" : undefined}
      data-squircle={squircle ? "" : undefined}
      data-block={block ? "" : undefined}
      data-uniform={uniform ? "" : undefined}
      data-loading={loading ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      {...props}
    >
      <span className="cx-btn__inner">{children}</span>
      {loading ? (
        <span aria-hidden className="cx-btn__loader">
          <Spinner />
        </span>
      ) : null}
    </Comp>
  );
}

/** 载入指示器：官方 --animate-spin = spin 2s steps(60,end) infinite（shell-shared:2856） */
export function Spinner({ className, size = "sm" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cn("cx-spinner", "cx-anim", className)} data-size={size} role="status">
      <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
        <circle cx="8" cy="8" opacity="0.25" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}
