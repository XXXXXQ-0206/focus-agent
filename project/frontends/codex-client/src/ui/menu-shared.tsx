import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/**
 * 菜单族（dropdown / context / menubar / select）共用的视觉件。
 *
 * 证据（SPEC §9 + 官方 token）：
 *   容器半径 20px（--menu-radius）、条目半径 15px（--menu-item-radius）、
 *   条目 padding 10px 12px → Electron 档 5px 8px、gutter 4px、
 *   底 rgb(45,45,45)（--menu-background-color）、backdrop-filter blur(16px)、
 *   阴影 --menu-box-shadow、corner-shape --menu-corner-shape。
 */

/** 菜单内容容器：三角形定位、模糊底、超椭圆角、进出场 */
export function MenuContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-menu__content", "cx-anim", className)} {...props} />;
}

export function MenuItem({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-menu__item", className)} {...props} />;
}

export interface MenuItemLabelProps {
  icon?: ReactNode;
  children?: ReactNode;
  /** 快捷键文本（右侧右对齐） */
  shortcut?: ReactNode;
  className?: string;
}

export function MenuItemLabel({ icon, children, shortcut, className }: MenuItemLabelProps) {
  return (
    <>
      {icon ? <span className="cx-menu__item-icon">{icon}</span> : null}
      <span className={cn("cx-menu__item-label", className)}>{children}</span>
      {shortcut ? <span className="cx-menu__shortcut">{shortcut}</span> : null}
    </>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-menu__label", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("cx-menu__separator", className)} {...props} />;
}
