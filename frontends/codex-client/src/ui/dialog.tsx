import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import "./ui.css";

/**
 * 官方 Modal 的「外部交互忽略清单」（bundle app-initial-25361a10f2bf.js@11041944，SPEC-OVERLAYS §13.4）：
 * 命中这些目标时 preventDefault（**不关**模态）。
 */
const IGNORE_OUTSIDE_INTERACTION = [
  "[data-grammarly-shadow-root]",
  "COM-1PASSWORD-BUTTON",
  "[data-sonner-toast]",
  "[data-sonner-toaster]",
  "[data-puik-ignore-outside-interaction]",
].join(", ");

/** 可聚焦元素选择器（bundle app-initial-25361a10f2bf.js@13674211 原文，SPEC-OVERLAYS §13.4）。 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === root,
  );
}

function isIgnoredOutsideTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(IGNORE_OUTSIDE_INTERACTION) !== null;
}

/**
 * 对话框根。
 *
 * 官方在 Context provider 上写死 `{ open, onOpenChange, modal: false }`
 * （bundle app-initial-25361a10f2bf.js@11041944）—— **Radix 层不是 modal**：
 * 不锁滚动、不设 aria-modal、不禁用外部指针事件；焦点锁与关闭策略由应用自理。
 * 所以这里把 Radix Root 的默认 modal 改成 false，与官方一致。
 */
/** 把 open 往下传：官方 Modal 的遮罩是**自己画的**（_ModalBackdrop_ovjjw_2），
 * 而 Radix 的 DialogOverlay 在 modal=false 时直接渲染 null（@radix-ui/react-dialog 里
 * `context.modal ? <Presence…> : null`），所以这里必须知道 open 才能照官方把遮罩画出来。 */
const DialogOpenContext = createContext(false);

export function Dialog({
  modal = false,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : uncontrolledOpen;
  return (
    <DialogOpenContext.Provider value={isOpen}>
      <DialogPrimitive.Root
        defaultOpen={defaultOpen}
        modal={modal}
        onOpenChange={(next) => {
          if (!controlled) setUncontrolledOpen(next);
          onOpenChange?.(next);
        }}
        open={isOpen}
        {...props}
      />
    </DialogOpenContext.Provider>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

/**
 * 遮罩（官方 _ModalBackdrop_ovjjw_2，SPEC-OVERLAYS §13.1）。
 * data-backdrop="fade" 时才吃 blur(1px)（--modal-backdrop-fade-filter）；默认档只有半透明底。
 */
export interface DialogOverlayProps extends ComponentProps<"div"> {
  /** 官方 _ModalBackdrop_ 的两个变体：dim（默认，#00000080）/ fade（再叠 blur(1px)） */
  backdrop?: "dim" | "fade";
}

export function DialogOverlay({ className, backdrop, ...props }: DialogOverlayProps) {
  const open = useContext(DialogOpenContext);
  return (
    <div
      aria-hidden="true"
      className={cn("cx-overlay", "cx-anim", "cx-dialog__overlay", className)}
      data-backdrop={backdrop === "fade" ? "fade" : undefined}
      data-state={open ? "open" : "closed"}
      {...props}
    />
  );
}

export interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  showClose?: boolean;
  /** 官方 scroll 默认 "inside"（SPEC-OVERLAYS §13.4）；映射到 data-modal-scroll */
  scroll?: "inside" | "outside";
  /** 内容溢出时给 body 加下边框（官方 [data-scrollable=true]） */
  scrollable?: boolean;
  /** 遮罩变体（官方 data-backdrop：dim 默认 / fade 叠 blur(1px)） */
  backdrop?: "dim" | "fade";
  children?: ReactNode;
}

/**
 * 对话框（模态）。
 *
 * 几何（官方CSS raw/ovjjw.css:12-33，SPEC-OVERLAYS §13.1-13.2）：
 *   半径 var(--modal-radius) → electron **15px**；max-width var(--modal-max-width, 450px)；
 *   Header 50 高 / 0 20px 内距 / 下边框 1px --color-border；Body 16px 20px；Footer 16px 20px + justify-end。
 * 动效：面板 .6s 进 / .3s 出（--modal-enter-duration / --modal-exit-duration = bundle 常量 600/300）；
 *   位移从 --modal-out-y（20px）+ 透明度 --modal-out-opacity（0）起，**没有缩放**。
 * 焦点锁与关闭策略（SPEC-OVERLAYS §13.4，逐条按 bundle 原文实现）：
 *   · 打开后若焦点不在面板内 → ref.focus({ preventScroll: true })
 *   · Shift+Tab 且事件目标是容器本身 → 回卷到末位可聚焦元素
 *   · focusOutside / blurOutside 一律 preventDefault（焦点移出不关）
 *   · pointerDownOutside / interactOutside 命中 sonner toast 等忽略清单时 preventDefault（点 toast 不关）
 *   · modal: false（见 Dialog 根组件）；Radix 层不做焦点陷阱，Tab 可离开
 */
export function DialogContent({
  className,
  title,
  description,
  footer,
  showClose = true,
  scroll = "inside",
  scrollable,
  backdrop,
  children,
  onKeyDown,
  onFocusOutside,
  onPointerDownOutside,
  onInteractOutside,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  // 官方：打开后自动聚焦（bundle 11041944 useEffect）
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay backdrop={backdrop} />
      <DialogPrimitive.Content
        className={cn("cx-dialog__content", "cx-anim", className)}
        data-modal-scroll={scroll}
        data-scrollable={scrollable ? "true" : undefined}
        onFocusOutside={(event) => {
          // 官方 dismissableLayer.focusOutside → preventDefault（不关）
          event.preventDefault();
          onFocusOutside?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (isIgnoredOutsideTarget(event.target)) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isIgnoredOutsideTarget(event.target)) event.preventDefault();
          onInteractOutside?.(event);
        }}
        onKeyDown={(event) => {
          // 官方：Shift+Tab 从容器回卷到末位可聚焦元素（bundle 11041944）
          const el = ref.current;
          if (el && event.target === el && event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            const list = getFocusable(el);
            list[list.length - 1]?.focus();
          }
          onKeyDown?.(event);
        }}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          const el = ref.current;
          if (el && !el.contains(document.activeElement)) {
            event.preventDefault();
            el.focus({ preventScroll: true });
          }
        }}
        ref={ref}
        tabIndex={-1}
        {...props}
      >
        <div className="cx-dialog__header">
          <DialogPrimitive.Title className="cx-dialog__title">{title}</DialogPrimitive.Title>
        </div>
        <div className="cx-dialog__body">
          {description ? (
            <DialogPrimitive.Description className="cx-dialog__description">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
        </div>
        {footer ? <div className="cx-dialog__footer">{footer}</div> : null}
        {showClose ? (
          <DialogPrimitive.Close asChild>
            <Button aria-label="关闭" className="cx-dialog__close" size="xs" uniform variant="ghost">
              <X aria-hidden size={16} />
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
