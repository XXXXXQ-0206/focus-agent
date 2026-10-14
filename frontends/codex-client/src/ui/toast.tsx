import type { ComponentProps } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

import { cn } from "@/lib/utils";

import "./ui.css";

/**
 * Toast 区容器。
 *
 * 证据（SPEC-OVERLAYS §9.1 实测）：官方 `.codex-toast-area` 是满视口的固定层
 *   `position: fixed; inset: 0; pointer-events: none; z-index: 60`，没有内边距、不居中内容；
 *   无 toast 时 `:not(:has([data-sonner-toast])) { visibility: hidden }`。
 * 内层 `.codex-toast-area__inner` 是本工程给宿主放 toaster 用的定位壳，不参与视觉。
 */
export function ToastArea({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("codex-toast-area", className)} {...props}>
      {/* task-46：宿主必须渲染在 __inner 里（官方层级是 容器 ▸ __inner ▸ toaster），
          否则 sonner 宿主的 fixed 定位与容器无父子关系，容器的 z-index:60 也就管不到它。 */}
      <div className="codex-toast-area__inner">{children}</div>
    </div>
  );
}

export interface ToasterProps extends ComponentProps<typeof SonnerToaster> {
  position?: "top-center" | "top-right" | "bottom-right" | "bottom-center";
}

/**
 * 官方偏移量（task-45 实测修正）。
 *
 * 官方 `shell-initial.css:7487-7494`：
 *   `[data-sonner-toaster].codex-sonner-toaster[data-x-position=right] {
 *      inset-inline: calc(var(--spacing,.25rem) * 6);   // = 24px
 *      top: calc(var(--spacing,.25rem) * 14);           // = 56px
 *      width: auto; max-width: calc(var(--spacing) * 80); margin-inline-start: auto; position: fixed }`
 *
 * ⚠️ **必须走 sonner 的 `offset` 属性，不能只靠 CSS**（task-42 量到的根因）：
 *   sonner 2.0.8 会把 `--offset-*` 以 **inline style** 写在宿主元素上（实测 host inline
 *   `--offset-top: 24px` / `--offset-right: 24px` …），并以 `top: var(--offset-top)` 定位；
 *   inline 自定义属性压过 `src/styles/ui.css:2114-2121` 里声明的 `top: 56px`
 *   ⇒ 改前实测宿主 `top: 24px`、toast 条 y=**24**（官方要 56）。
 *   `offset={{ top: 56, right: 24, left: 24 }}` 会把那三个变量一起写成官方值。
 *
 * `bottom` **不写**：官方采集（SPEC-OVERLAYS §9）只覆盖 `[data-x-position=right]` 的
 *   `top/inline`，bottom-* 档无实测 ⇒ 保持 sonner 默认（24），标注为「未实测」而不是猜一个值。
 */
const OFFICIAL_OFFSET = { top: 56, right: 24, left: 24 } as const;

/**
 * Toast 出口（sonner 封装）。
 *
 * 证据（官方CSS shell-initial.css:7480-7497，SPEC-OVERLAYS §9.2）：
 *   `[data-sonner-toaster].codex-sonner-toaster[data-x-position=right]`
 *   → `position: fixed; inset-inline: 24px; top: 56px; max-width: 320px`，子元素过渡 .3s。
 *   即官方是「右上、距顶 56px」；所以默认 position 取 top-right（旧实现默认 top-center 与官方不符）。
 */
export function Toaster({ className, position = "top-right", offset, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className={cn("codex-sonner-toaster", className)}
      offset={offset ?? OFFICIAL_OFFSET}
      position={position}
      toastOptions={{
        unstyled: true,
        classNames: { toast: "cx-toast cx-anim" },
      }}
      {...props}
    />
  );
}

export { toast };
