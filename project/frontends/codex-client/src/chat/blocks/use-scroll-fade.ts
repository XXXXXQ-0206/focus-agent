import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * 滚动上下渐隐遮罩（SPEC §2.3 / §4.6：官方 `vertical-scroll-fade-mask`）。
 *
 * ★ 2026-10-11 补证（源码级，本轮 task-43）：官方全机制已取到 ——
 *   captures/css-pretty/shell-shared.css 的三支规则 + 三个 @keyframes：
 *     .vertical-scroll-fade-mask        { mask: linear-gradient(to bottom **in oklch**,
 *                                            oklch(60% 0 0/0), oklch(85% 0 0) var(--top-fade) calc(100% - var(--bottom-fade)),
 *                                            oklch(60% 0 0/0)); animation:edge-fade … animation-timeline:scroll(self y) }
 *     .vertical-scroll-fade-mask-top    { 同渐变；animation-name:edge-fade-top }
 *     .vertical-scroll-fade-mask-bottom { linear-gradient(to bottom in oklch, oklch(85% 0 0),
 *                                            oklch(85% 0 0) calc(100% - var(--bottom-fade)), oklch(60% 0 0/0)); animation-name:edge-fade-bottom }
 *     @keyframes edge-fade        { 0%,1%{--top-fade:0;--bottom-fade:var(--edge-fade-distance,1rem)}
 *                                   99%,to{--top-fade:var(--edge-fade-distance,1rem);--bottom-fade:0} }
 *     @keyframes edge-fade-top    { 0%,1%{两边=distance} 99%,to{top=distance;bottom=0} }
 *     @keyframes edge-fade-bottom { 0%,1%{top=0;bottom=distance} 99%,to{两边=0} }
 *   ⇒ 官方是**纯 CSS scroll-driven animation** 驱动 --top-fade/--bottom-fade；
 *     0%/1% 与 99%/100% 的死区等价于我们的 1px 阈值，三支变体与我们的
 *     {top: 已滚过, bottom: 未到底} 两布尔**语义一一对应**。
 *   ⚠️ 机制仍**不同构**（我们用 JS 监听 + 内联 mask，官方是 CSS 动画）；
 *     本轮只把**渐变文本**对齐成官方那一条（in oklch + oklch(60% 0 0/0)/oklch(85% 0 0) + 两个 fade 变量），
 *     因为 srgb 插值与 oklch 插值的渐隐曲线不同。
 *   ⚠️ 运行时刻画（真机上官方这三支各自的观感）**未实测** —— 官方 capture 里没有块级滚动渐隐的运行时读数。
 *
 * 证据分级：
 *   ✅ 距离数值有出处（SPEC 逐块给了 2rem / 1.5rem / 1rem；官方 `--edge-fade-distance` 的可用档位见
 *      shell-shared.css 的 [--edge-fade-distance:1rem/1.25rem/1.5rem/2rem/2.5rem] 工具类）
 *   ✅ 渐变形 + 变量名 + keyframes 数值：本轮已从官方 CSS 取到（见上）
 */
export function useScrollFadeMask<T extends HTMLElement>(distance: string, options?: { reverse?: boolean }) {
  const reverse = options?.reverse ?? false;
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const update = useCallback(() => {
    const node = ref.current;
    if (!node) {
      setEdges({ top: false, bottom: false });
      return;
    }
    const overflowing = node.scrollHeight - node.clientHeight > 1;
    if (!overflowing) {
      setEdges({ top: false, bottom: false });
      return;
    }
    // column-reverse 容器：scrollTop 0 = 视觉底部，绝对值 = 已滚过的距离
    const offset = reverse ? Math.abs(node.scrollTop) : node.scrollTop;
    const max = node.scrollHeight - node.clientHeight;
    setEdges({ top: offset > 1, bottom: offset < max - 1 });
  }, [reverse]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    update();
    node.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(node);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(node, { childList: true, characterData: true, subtree: true });
    return () => {
      node.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [update]);

  // 官方渐变形逐字对齐（shell-shared.css，见文件头）：两端都是 oklch，fade 变量为 0 时该边不渐隐。
  // 用一条公式覆盖官方三支（both / -top / -bottom）：-bottom 那支等价于 top-fade=0；-top 那支等价于 bottom 只在未到底时非 0。
  const topFade = edges.top ? distance : "0px";
  const bottomFade = edges.bottom ? distance : "0px";
  const maskImage =
    edges.top || edges.bottom
      ? `linear-gradient(to bottom in oklch, oklch(60% 0 0/0), oklch(85% 0 0) ${topFade} calc(100% - ${bottomFade}), oklch(60% 0 0/0))`
      : undefined;

  return { maskImage, ref };
}
