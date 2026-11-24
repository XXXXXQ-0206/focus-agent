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
  /**
   * 列表条目里的第二行说明（例如端点地址、协议路径）。
   *
   * ★ 2026-10-15（用户截图：表单里的两个下拉"都挤出来了"）——
   *   Radix 会把**选中项 `ItemText` 的内容 portal 进触发器**（SelectValue），
   *   所以只要把说明放进 `ItemText`，28px 高的触发器里就会出现两行文字、直接顶出边框。
   *   这里刻意把它渲染成 `ItemText` 的**兄弟节点**：下拉列表里看得到，触发器里永远看不到。
   *   需要"触发器里也显示说明"时不要走这条路，应该改触发器自身的渲染。
   */
  description?: ReactNode;
}

export function SelectItem({ className, children, description, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item className={cn("cx-select__item", className)} {...props}>
      <span className="cx-select__item-main" data-with-description={description ? "" : undefined}>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description ? <span className="cx-select__item-description">{description}</span> : null}
      </span>
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
