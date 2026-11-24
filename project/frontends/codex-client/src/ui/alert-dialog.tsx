import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./ui.css";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn("cx-overlay", "cx-anim", "cx-dialog__overlay", className)}
      {...props}
    />
  );
}

export interface AlertDialogContentProps
  extends Omit<ComponentProps<typeof AlertDialogPrimitive.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * 确认对话框：与 Dialog 共用几何（半径 15px / 内边距 20px / 250–450px / 同款遮罩），
 * 差异只有语义：Cancel/Action 是 AlertDialog 的专属按钮槽，Esc 取消即关闭。
 */
export function AlertDialogContent({
  className,
  title,
  description,
  footer,
  children,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn("cx-dialog__content", "cx-alert-dialog__content", "cx-anim", className)}
        {...props}
      >
        <div className="cx-dialog__header">
          <AlertDialogPrimitive.Title className="cx-dialog__title">{title}</AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="cx-dialog__description">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
        </div>
        {children}
        {footer ? <div className={cn("cx-dialog__footer", "cx-alert-dialog__footer")}>{footer}</div> : null}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(className)} {...props} />;
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(className)} {...props} />;
}
