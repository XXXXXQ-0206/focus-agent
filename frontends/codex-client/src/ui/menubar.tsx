import { Menubar as MenubarPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MenuItemLabel, MenuLabel, MenuSeparator } from "./menu-shared";
import "./ui.css";

export const Menubar = MenubarPrimitive.Root;
export const MenubarMenu = MenubarPrimitive.Menu;
export const MenubarGroup = MenubarPrimitive.Group;
export const MenubarSub = MenubarPrimitive.Sub;
export const MenubarRadioGroup = MenubarPrimitive.RadioGroup;

/**
 * 菜单栏（顶部 36px 那一条的 DOM 自绘菜单，SPEC §4）。
 *
 * 触发按钮实测：49×23、圆角 10px、padding 4px 10px、14px/14px/400、
 * hover/开态底 rgba(255,255,255,.03)、字色 rgb(223,223,223)（SPEC §4）。
 * 下拉容器：x 对齐触发按钮、y = 触发底 − 6px（向上叠 6px）、bg rgb(31,31,31)、
 * 圆角 7.5px、无 backdrop-filter、条目 28 高 / padding 5px 16px（SPEC §5）。
 */
export function MenubarTrigger({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return <MenubarPrimitive.Trigger className={cn("cx-menubar__trigger", className)} {...props} />;
}

export function MenubarContent({
  className,
  align = "start",
  sideOffset = -6,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        align={align}
        className={cn("cx-menu__content", "cx-menubar__content", "cx-anim", className)}
        sideOffset={sideOffset}
        {...props}
      />
    </MenubarPrimitive.Portal>
  );
}

export interface MenubarItemProps extends ComponentProps<typeof MenubarPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  children?: ReactNode;
}

export function MenubarItem({ className, icon, shortcut, children, ...props }: MenubarItemProps) {
  return (
    <MenubarPrimitive.Item className={cn("cx-menu__item", "cx-menubar__item", className)} {...props}>
      <MenuItemLabel icon={icon} shortcut={shortcut}>
        {children}
      </MenuItemLabel>
    </MenubarPrimitive.Item>
  );
}

export { MenuLabel as MenubarLabel, MenuSeparator as MenubarSeparator };
