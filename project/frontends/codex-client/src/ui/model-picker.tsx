import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/**
 * 模型选择器弹层（官方 _ModelPickerDropdownContent_b9jvu_2 + _Menu_1d00n_1 + _ViewToggle_1d00n_195
 * + _SliderKeyboardControl_1d00n_123）。
 *
 * 布局尺寸是 **254×84**：宽 = calc(var(--spacing) * 63.5)（官方CSS raw/b9jvu.css:16），
 * 高 = 4(padding) + 36(第 1 行) + 36(第 2 行) + 4(padding)（SPEC-OVERLAYS §1.5 高度账）。
 * ⚠️ SPEC §9 记的 249×82 是入场动画 scale(.98) 的第 0 帧，不要按它实现。
 * 视觉：底 surface-elevated-secondary/90、圆角 20px、ring .5px、影 --shadow-xl-spread、
 *   **backdrop-filter: blur(8px)**（Tailwind backdrop-blur-sm；electron 下 --menu-backdrop-filter 无定义，
 *   它只存在于 browser 分支，SPEC-OVERLAYS §0.1）。
 * 动效：.32s cubic-bezier(.23,1,.32,1) 延迟 30ms，0% 到 scale(.98)；这是官方**唯一**自己写了
 *   reduced-motion 分支的弹层之一（:has(> [data-reduced-motion=true]) { animation: none }）。
 *
 * 宿主（src/chat 的输入区）负责用 Radix DropdownMenu 包裹以获得键盘语义；
 * 本文件只保证几何与视觉 1:1，且可被自测台直接量测。
 */
export function ModelPickerContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-model-picker__content", "cx-anim", className)} {...props} />;
}

/** 第 1 行宿主（_ViewControls_1d00n_170）：高 36、居中、padding-inline 8px、::before 占位 16px */
export function ModelPickerViewControls({
  explicitModel,
  className,
  ...props
}: ComponentProps<"div"> & { explicitModel?: boolean }) {
  return (
    <div
      className={cn("cx-model-picker__view-controls", className)}
      data-explicit-model={explicitModel ? "true" : undefined}
      {...props}
    />
  );
}

/** 第 1 行本体（_ViewToggle_1d00n_195）：min-height 32、圆角 8px、padding 4px、14px/500/20px */
export function ModelPickerViewToggle({
  className,
  children,
  ...props
}: ComponentProps<"button"> & { children?: ReactNode }) {
  return (
    <button className={cn("cx-model-picker__view-toggle", className)} type="button" {...props}>
      <span className="cx-model-picker__row-content">{children}</span>
    </button>
  );
}

/** 第 2 行宿主（_SimpleView_1d00n_118）：min-height 36 + padding-block 4px */
export function ModelPickerSliderRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-model-picker__slider-row", className)} {...props} />;
}

/** 强度滑杆宿主（_SliderKeyboardControl_1d00n_123）：outline 0 / margin 0 / padding 0 / display block */
export function ModelPickerSlider({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-model-picker__slider", className)} {...props} />;
}

/** 多模型列表（_ModelList_1d00n_10）——本轮参考端只有单模型，列表态未实测（SPEC §1.5 末尾） */
export function ModelPickerList({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-model-picker__list", className)} {...props} />;
}
