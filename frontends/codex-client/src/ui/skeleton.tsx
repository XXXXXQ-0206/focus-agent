import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/** 骨架屏：底 = --color-background-primary-ghost-hover，2s 呼吸（--cubic-move） */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("cx-skeleton", "cx-anim", className)} {...props} />;
}
