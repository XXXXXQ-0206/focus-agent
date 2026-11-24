import { Check, ChevronRight } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MenuItemLabel, MenuLabel, MenuSeparator } from "./menu-shared";
import "./ui.css";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

/**
 * 右键菜单：与 DropdownMenu 共用 --menu-* 视觉（官方两种菜单同款 token）。
 * 键盘：Shift+F10 / 菜单键唤出、↑↓ 移动、Esc 关闭。
 */
export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn("cx-menu__content", "cx-anim", className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export interface ContextMenuItemProps extends ComponentProps<typeof ContextMenuPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  children?: ReactNode;
}

export function ContextMenuItem({ className, icon, shortcut, children, ...props }: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item className={cn("cx-menu__item", className)} {...props}>
      <MenuItemLabel icon={icon} shortcut={shortcut}>
        {children}
      </MenuItemLabel>
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem className={cn("cx-menu__checkbox-item", className)} {...props}>
      <span className="cx-menu__indicator">
        <ContextMenuPrimitive.ItemIndicator>
          <Check aria-hidden size={14} />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger className={cn("cx-menu__sub-trigger", className)} {...props}>
      {children}
      <ChevronRight aria-hidden className="cx-menu__sub-arrow" size={14} />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      className={cn("cx-menu__content", "cx-anim", className)}
      sideOffset={2}
      {...props}
    />
  );
}

export { MenuLabel as ContextMenuLabel, MenuSeparator as ContextMenuSeparator };
