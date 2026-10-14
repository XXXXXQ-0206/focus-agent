import { type CSSProperties, useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * 增删数字的逐位滚动（官方 rolling number）。
 * ============================================================================
 * **官方出处（全部确证，非推断）**：
 *  · CSS：captures/css-pretty/shell-initial.css:3391-3412 ——
 *      ._DigitColumn_1rr6w_1 { width:1ch; height:1lh; line-height:inherit;
 *        contain:layout paint style; display:inline-block; position:relative }
 *      ._DigitColumn_1rr6w_1:before { content:"0"; visibility:hidden }
 *      ._DigitStack_1rr6w_17 { contain:layout size style; height:1lh;
 *        transition:transform var(--transition-duration-relaxed) cubic-bezier(.16,1,.3,1);
 *        will-change:transform; flex-direction:column; display:flex }
 *      ._DigitStack_1rr6w_17 > span { flex:0 0 1lh; height:1lh }
 *      @media (prefers-reduced-motion:reduce){ ._DigitStack_1rr6w_17{ transition:none } }
 *  · 类名映射：app/webview/assets/app-initial-25361a10f2bf.js @7003142
 *      A2i="_DigitColumn_1rr6w_1"; j2i="_DigitStack_1rr6w_17"
 *  · 渲染代码：同文件 @7006440（F2i 数值容器）/ @7006958（I2i 单数字位）
 *      I2i: <span aria-hidden className=DigitColumn data-variant={variant}>
 *             <span className="absolute inset-0 overflow-hidden">
 *               <span className=DigitStack style={{transform:`translateY(-${digit}lh)`}}>
 *                 {["0".."9"].map(d => <span key={d}>{d}</span>)}
 *      F2i: <span aria-label={formatNumber(value)} className="inline-flex h-lh items-baseline leading-[inherit]">
 *             数字位 → I2i；其余字符 → <span aria-hidden className="inline-block h-lh self-start leading-[inherit]">
 *  · 调用点（证明它就是增删统计用的那枚）：sites-end-resource-ecc479065e0b.js @236820
 *      <span className="… tabular-nums [--rolling-number-y-offset:0px]">
 *        <Zl value={reconnectAttempt} variant="inline" /> …
 *      以及 app-initial @7003200 的 P2i（`+N/-M` 组合）用 animated 开关切到 F2i。
 *
 * ⚠️ 证据边界：**无运行时实测**（SPEC-CONVERSATION-BLOCKS §13.4：计划/文件块 UI 未实测）。
 *    本文件是「官方 CSS 原文 + 官方渲染代码」的确定性复刻，字号/行高由父级 inherit 决定。
 */

/** 官方 B2i = [0..9]（app-initial @7008082） */
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** 官方 R2i：e >= "0" && e <= "9"（app-initial @7007928） */
function isDigit(char: string) {
  return char >= "0" && char <= "9";
}

export type RollingNumberVariant = "diff-stat" | "inline";

/** 单个数字位（官方 I2i） */
function DigitColumn({ digit, variant }: { digit: string; variant: RollingNumberVariant }) {
  const style = useMemo<CSSProperties>(() => ({ transform: `translateY(-${digit}lh)` }), [digit]);
  return (
    <span aria-hidden="true" className="cx-digitcol" data-variant={variant}>
      <span className="cx-digitcol__clip">
        <span className="cx-digitstack" style={style}>
          {DIGITS.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </span>
      </span>
    </span>
  );
}

/** 数值容器（官方 F2i）：可访问名是格式化后的完整数字，逐位数字对 AT 隐藏。 */
export function RollingNumber({
  className,
  value,
  variant = "diff-stat",
}: {
  className?: string;
  value: number;
  variant?: RollingNumberVariant;
}) {
  const formatted = useMemo(() => new Intl.NumberFormat().format(value), [value]);
  const chars = useMemo(() => Array.from(formatted), [formatted]);

  // 官方 key 用「从右往左的数字序号」，让进位/退位时 React 复用同一列（滚动才连续）
  let remaining = chars.filter(isDigit).length;

  return (
    // 可访问名只从这里来：逐位数字与分隔符对 AT 全隐藏（官方 F2i 的语义）。
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 官方 DOM 就是 span[aria-label]（app-initial-25361a10f2bf.js @7006440，F2i 的根），逐字复刻不改形态
    <span aria-label={formatted} className={cn("cx-rolling", className)}>
      {chars.map((char, index) => {
        if (isDigit(char)) {
          remaining -= 1;
          return <DigitColumn digit={char} key={`digit-${remaining}`} variant={variant} />;
        }
        return (
          <span aria-hidden="true" className="cx-rolling__sep" key={`separator-${index}`}>
            {char}
          </span>
        );
      })}
    </span>
  );
}
