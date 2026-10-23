import type { SVGProps } from "react";

/**
 * 本目录自用内联 SVG（**不修改 src/icons**，task-13 的范围约束）。
 * ----------------------------------------------------------------------------
 * 证据分级逐条标注：
 *  ✅ CheckmarkLgLight12 —— 逐字节来自官方图标目录
 *     `catalog:checkmark-lg-light-12`（official-icons-catalog.json，viewBox "0 0 12 12"，
 *     pathCount 1）。SPEC §4.5 / §13.8 说"项目缺这枚 12px 组件"——这里补上，
 *     建议 src/icons 的属主日后把它收编为正式组件。
 *  ⚠️ DisclosureChevron20 —— **形状未实测**。SPEC §13.8：官方折叠箭头 20×20、
 *     path 前缀 `M7.52925 3.7793…`，完整 d 未取到（在 1031 目录之外的自定义内联 SVG）。
 *     这里用等价 20×20 折线占位，**不得**当作"与 Focus 一致"。
 *  ⚠️ WrapToggleIcon —— **形状未实测**：SPEC §11.1 只确证代码块工具条存在一个
 *     `aria-label="启用自动换行" aria-pressed` 的按钮（36×36），图标名称与路径都未取到。
 *
 * 复制按钮不在此列：SPEC §4.5 / §11.5 已确证 = `CodexCopy`（`src/icons/conversation.tsx`，21×21）。
 */

/** `catalog:checkmark-lg-light-12` —— 12×12，命令块状态行的成功图标（SPEC §4.5）。 */
export function CheckmarkLgLight12(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      focusable="false"
      height={12}
      viewBox="0 0 12 12"
      width={12}
      {...props}
    >
      <path d="M9.53532 2.22277C9.66082 2.04108 9.91018 1.99578 10.092 2.12121C10.2737 2.2467 10.319 2.49606 10.1935 2.67785L5.40544 9.61535C5.2377 9.86166 4.88746 9.89564 4.67692 9.68469L1.84098 6.87023C1.68424 6.71471 1.68269 6.46066 1.83805 6.30383C1.99355 6.14723 2.24668 6.14665 2.40348 6.30187L4.96598 8.84386L9.53532 2.22277Z" />
    </svg>
  );
}

/** ⚠️ 形状未实测的 20×20 折叠箭头占位（SPEC §13.8：仅知尺寸与 path 前缀）。 */
export function DisclosureChevron20(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-icon-evidence="unmeasured"
      fill="none"
      focusable="false"
      height={20}
      viewBox="0 0 20 20"
      width={20}
      {...props}
    >
      <path
        d="M7.5 3.78 11.72 8 7.5 12.22"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
    </svg>
  );
}

/** ⚠️ 形状未实测的换行按钮占位图标（SPEC §11.1 只确证按钮存在与 aria-pressed 语义）。 */
export function WrapToggleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-icon-evidence="unmeasured"
      fill="none"
      focusable="false"
      height={16}
      viewBox="0 0 16 16"
      width={16}
      {...props}
    >
      <path
        d="M2 4h12M2 8h8.5a2.25 2.25 0 1 1 0 4.5H8m0 0 1.5-1.5M8 12.5 9.5 14M2 12h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}

/**
 * ⚠️ **形状未实测**：代码块工具条的 Preview/Code 切换图标。
 * 官方 chatgpt-code-block-b5d561b77f27.js @41200 只确证按钮存在（aria-label = Preview / Code、
 * size:"imageToolbar"、uniform），图标绑定是 {16:S,20:M} / {assets:{16:L,20:l}} 四个符号，
 * 其 SVG 字面量未取到 ⇒ 这里自绘占位，**不得**当作「与 Focus 一致」。
 */
export function PreviewToggleIcon({ preview, ...props }: SVGProps<SVGSVGElement> & { preview?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-icon-evidence="unmeasured"
      fill="none"
      focusable="false"
      height={16}
      viewBox="0 0 16 16"
      width={16}
      {...props}
    >
      {preview ? (
        <path
          d="m5.2 3.6-3 4.4 3 4.4M10.8 3.6l3 4.4-3 4.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
      ) : (
        <>
          <path
            d="M1.6 8S4.2 3.8 8 3.8 14.4 8 14.4 8 11.8 12.2 8 12.2 1.6 8 1.6 8Z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

/**
 * ⚠️ **形状未实测**：代码块的 Scroll to bottom 图标。
 * 官方 chatgpt-code-block-b5d561b77f27.js @13504 只确证按钮的 className="bottom-4" 与文案，
 * 按钮自身的尺寸/配色/图标均未取到 ⇒ 自绘占位。
 */
export function ScrollToBottomIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-icon-evidence="unmeasured"
      fill="none"
      focusable="false"
      height={20}
      viewBox="0 0 20 20"
      width={20}
      {...props}
    >
      <path
        d="M10 4.2v9.1m0 0 3.6-3.6M10 13.3 6.4 9.7M4.6 15.8h10.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
