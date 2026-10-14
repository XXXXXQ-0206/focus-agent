import { type KeyboardEvent, type RefObject, useCallback } from "react";

/**
 * 弹层内的 roving focus（复刻官方菜单语义）。
 *
 * 证据：参考端的两个弹层都是 Radix **DropdownMenu**（实测 `[role=menu]` + `data-radix-menu-content`
 * + 条目 `data-radix-collection-item`、全部 `tabindex=-1`），键盘语义见
 * docs/SPEC-OVERLAYS.md §1.7 / §2.5：ArrowDown/ArrowUp 在 `[role=menuitem]` 间回卷移动；
 * Escape 关闭并归还焦点（Radix 语义，**未实测**）；Tab 关闭菜单。
 *
 * 本工程按任务要求用 `radix-ui` 的 **Popover** 承载（Popover 自带 Esc 关闭 + onCloseAutoFocus
 * 归还焦点），导航键由本 hook 补上。
 */
const FOCUSABLE = '[role="menuitem"],[role="menuitemradio"],[role="slider"]';

export function useRovingMenu(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const root = ref.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) =>
          el.closest('[data-active="false"]') === null &&
          !el.hasAttribute("disabled") &&
          // 只有「真正能拿到焦点的」才进导航集合：强度滑杆的**外层**是 <span role=menuitem>
          // （官方 _SliderKeyboardControl_1d00n_123 同款），它没有 tabindex、.focus() 无效；
          // 真正可聚焦的是 Radix 注入的 <span role=slider> 滑块 —— 焦点落在滑块上，
          // ←/→ 由 Radix 原生处理，正好满足 aria-keyshortcuts="ArrowLeft ArrowRight"。
          (el.getAttribute("role") === "slider" || el.tagName === "BUTTON"),
      );
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const focus = (next: number) => {
        const i = ((next % items.length) + items.length) % items.length;
        items[i]?.focus();
      };
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focus(index + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focus(index - 1);
          break;
        case "Home":
          event.preventDefault();
          focus(0);
          break;
        case "End":
          event.preventDefault();
          focus(items.length - 1);
          break;
        case "Tab":
          // 菜单语义：Tab 关闭菜单，焦点落到容器外
          onDismiss();
          break;
        default:
          break;
      }
    },
    [onDismiss, ref],
  );
}
