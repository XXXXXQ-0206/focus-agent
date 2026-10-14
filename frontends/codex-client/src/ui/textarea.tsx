import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export interface TextareaProps extends ComponentProps<"textarea"> {
  variant?: "outline" | "soft";
  invalid?: boolean;
}

/** 多行输入。证据：同 Input 的 --input-* token 体系（shell-shared:3901-3912） */
export function Textarea({ className, variant = "soft", invalid, disabled, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn("cx-textarea", "cx-anim", className)}
      data-invalid={invalid ? "" : undefined}
      data-variant={variant}
      disabled={disabled}
      {...props}
    />
  );
}
