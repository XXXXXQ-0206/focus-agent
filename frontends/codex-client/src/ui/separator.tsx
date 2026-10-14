import { Separator as SeparatorPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export type SeparatorProps = ComponentProps<typeof SeparatorPrimitive.Root>;

/** 分隔线：1px（横）/ 1px（纵），色 --color-border（SPEC §5 菜单分隔线实测同色） */
export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      className={cn("cx-separator", className)}
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  );
}
