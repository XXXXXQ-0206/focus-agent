import { Check, ChevronRight, Dot } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MenuItemLabel, MenuLabel, MenuSeparator } from "./menu-shared";
import "./ui.css";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/**
 * 下拉菜单。
 *
 * 视觉全部来自官方 --menu-*（半径 20px / 条目 15px / padding 5px 8px / gutter 4px /
 * 底 rgb(45,45,45) / blur(16px) / --menu-box-shadow / corner-shape），见 ui.css §9。
 * 键盘：↑↓ 移动、→ 进子菜单、← 返回、Esc 关闭并把焦点归还触发按钮（Radix 内建）。
 */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn("cx-menu__content", "cx-anim", className)}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof DropdownMenuPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  children?: ReactNode;
}

export function DropdownMenuItem({ className, icon, shortcut, children, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item className={cn("cx-menu__item", className)} {...props}>
      <MenuItemLabel icon={icon} shortcut={shortcut}>
        {children}
      </MenuItemLabel>
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn("cx-menu__checkbox-item", className)} {...props}>
      <span className="cx-menu__indicator">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden size={14} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn("cx-menu__radio-item", className)} {...props}>
      <span className="cx-menu__indicator">
        <DropdownMenuPrimitive.ItemIndicator>
          <Dot aria-hidden size={14} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger className={cn("cx-menu__sub-trigger", className)} {...props}>
      {children}
      <ChevronRight aria-hidden className="cx-menu__sub-arrow" size={14} />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      className={cn("cx-menu__content", "cx-anim", className)}
      sideOffset={2}
      {...props}
    />
  );
}

export { MenuLabel as DropdownMenuLabel, MenuSeparator as DropdownMenuSeparator };
