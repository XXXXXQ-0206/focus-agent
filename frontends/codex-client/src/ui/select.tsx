import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

/**
 * 下拉选择。
 *
 * 证据：官方 --select-control-font-weight（medium）、--select-item-active-font-weight
 * （semibold）、--select-list-scale = .95（shell-shared:4006-4008）；
 * 列表本体沿用 --menu-* 表面（半径 20px / 条目 15px / gutter 4px / blur(16px)）。
 * 键盘：Enter/Space 展开、↑↓ 移动、字母跳转、Home/End、Esc 关闭（Radix 内建）。
 */
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={cn("cx-select__trigger", "cx-anim", className)} {...props}>
      {children}
      <SelectPrimitive.Icon className="cx-select__icon">
        <ChevronDown aria-hidden size={14} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn("cx-menu__content", "cx-select__content", "cx-anim", className)}
        position={position}
        sideOffset={sideOffset}
        {...props}
      >
        <SelectPrimitive.Viewport className="cx-select__viewport">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export interface SelectItemProps extends ComponentProps<typeof SelectPrimitive.Item> {
  children?: ReactNode;
}

export function SelectItem({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item className={cn("cx-select__item", className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="cx-menu__indicator" style={{ marginInlineStart: "auto" }}>
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden size={14} />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export const SelectLabel = SelectPrimitive.Label;
export const SelectSeparator = SelectPrimitive.Separator;
export const SelectScrollUpButton = SelectPrimitive.ScrollUpButton;
export const SelectScrollDownButton = SelectPrimitive.ScrollDownButton;
