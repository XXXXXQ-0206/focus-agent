import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

/**
 * 权限菜单（官方 Tailwind 组合式，SPEC-OVERLAYS §2 实测逐项）。
 *
 *   容器 320×161.6875 = 4(padding)×2 + 26(表头) + 42.5625×3（条目步进）
 *   条目 312 × 42.5625 = padding 5px 8px + 内容 32.5625；圆角 **15px**（rounded-xl）；
 *     字号 13px / 行高 18.5714px；字重 430；行内容 gap 6px；色 rgb(223,223,223)
 *   hover：hover:bg-primary-ghost-hover = rgba(255,255,255,.078)
 *   容器与条目都用 backdrop-blur-sm = **8px**（不是 --menu-backdrop-filter 的 16px，SPEC §0.1）
 * 与 §5 的 _MenuItem_12y2s_2（::before 高亮面）是两套实现，SPEC §2.4 明确不要混：
 * 这里是 B 类——直接换底色。
 *
 * 宿主自行用 Radix DropdownMenu 包一层拿键盘语义；本文件只保证几何与视觉 1:1。
 */
export function PermissionMenuContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("cx-permission-menu__content", "cx-anim", className)} role="menu" {...props} />;
}

/** 表头 26px：文案 + 右侧「了解更多」链接（SPEC §2.3 表头行） */
export function PermissionMenuHeader({
  className,
  title,
  action,
  ...props
}: ComponentProps<"div"> & { title: ReactNode; action?: ReactNode }) {
  return (
    <div className={cn("cx-permission-menu__header", className)} {...props}>
      <span>{title}</span>
      {action}
    </div>
  );
}

export interface PermissionMenuItemProps extends Omit<ComponentProps<"button">, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  selected?: boolean;
}

/** 条目：312×42.5625（min-height 由内容 + padding 自证） */
export function PermissionMenuItem({
  className,
  icon,
  title,
  description,
  selected,
  ...props
}: PermissionMenuItemProps) {
  return (
    <button
      aria-checked={selected ? "true" : "false"}
      className={cn("cx-permission-menu__item", className)}
      role="menuitemradio"
      type="button"
      {...props}
    >
      {icon ? <span className="cx-permission-menu__leading-icon">{icon}</span> : null}
      <span className="cx-permission-menu__item-content">
        <span className="cx-permission-menu__item-title">{title}</span>
        {description ? <span className="cx-permission-menu__item-description">{description}</span> : null}
      </span>
      {selected ? <Check aria-hidden className="cx-permission-menu__check" size={14} /> : null}
    </button>
  );
}
