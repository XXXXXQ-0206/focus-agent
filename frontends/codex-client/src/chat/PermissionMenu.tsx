import { Popover as PopoverPrimitive } from "radix-ui";
import { useCallback, useRef, useState } from "react";

import { CodexCheck, CodexPermissions } from "@/icons";
import { cn } from "@/lib/utils";

import { CHAT_PERMISSIONS } from "./options";
import { useRovingMenu } from "./use-roving-menu";

/**
 * 权限菜单弹层（audit #126 #127）。
 *
 * 参考端实测（captures/views-permission-menu.json @1280×816，SPEC-OVERLAYS §2）：
 *   触发器     button[data-composer-navigation-target=permissions] 481.333,760 **85.333×28**
 *              aria-label「更改权限」 bg rgba(255,255,255,.08) br 9999px cs SE1(1)
 *              pad 0 6px gap 4px justify-content center 13px/18px/430；打开态 data-side=top data-align=start
 *   弹层       role=menu data-side=top data-align=start [role=menu] **482.333,596.333 320×161.6875**
 *              = 触发器 x 481.333 + 1px（m-px）；br **20px** cs superellipse(1.5)
 *              backdrop-filter **blur(8px)** bg oklab(0.297161 …/0.9) padding **4px** z-index 50
 *              底边↔锚点顶边 **1.98px**（SPEC-OVERLAYS §2.2）→ sideOffset 1（+1px m-px = 内容底 758.02）
 *   表头       div.text-codex-description 486.333,600.333 **312×26**
 *              padding **5px 8px** fg rgba(255,255,255,.498) 13px/16px；文案「应如何批准 ChatGPT 操作?」
 *              + 右侧「了解更多」链接（截图 ref-07 可见，带下划线）
 *   条目 ×3    486.333,y **312×42.5625**，y 步进 **42.5625**（626.333 / 668.896 / 711.458）
 *              padding **5px 8px** br **15px** 13px/18.5714px/430 色 rgb(223,223,223)
 *              行内容盒 296×**32.5625** gap 6px（= 标题 18.5714 + 描述 14，逐项实测反算）
 *   当前项     第 3 条尾部有 ✓（截图 ref-07 + 实测 html 尾部含 Check 图标），文字转橙
 *              （运行端 token --color-text-warning = #ff8549，与输入区胶囊一致）
 *   高度账     4 + 26 + 42.5625×3 + 4 = **161.6875** ✓
 *
 * ⚠️ 三条条目的 leading 图标在截图里互不相同，但图标身份**未取证**（无 DOM 证据），
 *    这里统一用 `.cx-chip` 同族的 CodexPermissions，并在汇报里记为未实测。
 * ⚠️ 桌面端不存在「了解更多」的落地页 → 渲染为不可导航链接（阻止默认跳转）。
 */
export function PermissionMenuChip({
  className,
  onSelect,
  permissionId,
}: {
  className?: string;
  onSelect: (id: string) => void;
  permissionId: string;
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const onKeyDown = useRovingMenu(contentRef, close);

  const current =
    CHAT_PERMISSIONS.find((p) => p.id === permissionId) ?? CHAT_PERMISSIONS[CHAT_PERMISSIONS.length - 1];

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen} open={open}>
      <PopoverPrimitive.Trigger asChild>
        <button
          aria-label="更改权限"
          className={cn("cx-chip", className)}
          data-composer-navigation-target="permissions"
          type="button"
        >
          <CodexPermissions size={16} />
          <span className={cn("cx-chip__value", current.tone === "warning" && "is-warning")}>
            {current.chip}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          aria-label="应如何批准 ChatGPT 操作？"
          aria-orientation="vertical"
          className="cx-overlay cx-pm"
          data-radix-menu-content=""
          onKeyDown={onKeyDown}
          ref={contentRef}
          role="menu"
          side="top"
          sideOffset={1}
          tabIndex={-1}
        >
          <div className="cx-pm__head">
            <span className="cx-pm__head-title">应如何批准 ChatGPT 操作？</span>
            <a
              className="cx-pm__learn"
              href="https://help.openai.com/"
              onClick={(event) => event.preventDefault()}
              rel="noreferrer"
              target="_blank"
            >
              了解更多
            </a>
          </div>
          {CHAT_PERMISSIONS.map((option) => {
            const selected = option.id === permissionId;
            return (
              <button
                aria-checked={selected}
                className="cx-pm__item"
                data-tone={option.tone ?? "default"}
                key={option.id}
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
                role="menuitemradio"
                tabIndex={-1}
                type="button"
              >
                <span className="cx-pm__item-content">
                  <CodexPermissions aria-hidden className="cx-pm__item-icon" size={16} />
                  <span className="cx-pm__item-text">
                    <span className="cx-pm__item-title">{option.title}</span>
                    <span className="cx-pm__item-desc">{option.desc}</span>
                  </span>
                  {selected ? <CodexCheck aria-hidden className="cx-pm__item-check" size={16} /> : null}
                </span>
              </button>
            );
          })}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
