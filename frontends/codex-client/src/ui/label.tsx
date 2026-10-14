import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/**
 * 表单标签。
 * 证据：官方表单 _label_ = 14px/500/20（page-9aed74b17655.css
 * ._label_5lmnb_40 → color var(--color-text) / font-size 14px / font-weight 500 / line-height 20px）。
 */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("cx-label", className)} {...props} />;
}
