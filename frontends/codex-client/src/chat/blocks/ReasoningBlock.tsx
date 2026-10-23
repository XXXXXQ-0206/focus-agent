import { Fragment, type ReactNode } from "react";

import type { ReasoningNode } from "./types";
import { useScrollFadeMask } from "./use-scroll-fade";

/**
 * 推理 / 思考块（SPEC §3，**包内确证**）
 * ============================================================================
 * 官方组件源码（`sites-end-resource-ecc479065e0b.js` 的 `Aw`）逐字：
 *
 *   <DisclosureShell header={<DisclosureHeader disclosure={hasContent ? {…} : undefined}>
 *       <ActiveText active={!completed}
 *                   className="text-text/30 text-size-chat truncate group-hover/activity-header:text-default">
 *         {label}
 *       </ActiveText>
 *     </DisclosureHeader>}
 *     body={<motion.div initial={false} animate={{height: expanded ? measured : 0, opacity: expanded ? 1 : 0}} …>
 *       <ScrollArea variant="flush">
 *         {expanded ? <AutoHeightScroller
 *            autoScrollToBottom={isStreaming}
 *            contentClassName="gap-0"
 *            maxHeightByState={{preview:"8.75rem", expanded:"8.75rem", collapsed:"0px"}}
 *            className="[--edge-fade-distance:1rem]" /> : null}
 *       </ScrollArea>
 *     </motion.div>} />
 *
 *  • maxHeightByState：preview / expanded = **8.75rem = 140px**，collapsed = **0px**（SPEC §3.2/§3.6）
 *  • 正文包裹：`text-text/60 [&_*]:text-text/50 break-words text-size-chat`（SPEC §3.3）
 *  • AutoHeightScroller 根：`vertical-scroll-fade-mask [--edge-fade-distance:1.5rem] overflow-y-auto`
 *    + 流式时 `flex flex-col-reverse`（SPEC §3.2），内层 `flex flex-col gap-1`
 *  • 文案（SPEC §3.5）：`Thinking`（流式）/ `Thought` / `Thought for {elapsed}`
 *    ✅ zh-CN 原文已从官方 zh-CN 语言块取到（2026-10-10，见下 REASONING_LABELS）：
 *    「正在思考」/「已完成思考」/「已思考 {elapsed}」—— 原先的推断译文已作废。
 *  • elapsed（2026-10-10 补齐，官方语义 + 格式均已在包内确证，见 useReasoningElapsed）：
 *    计时口径 = 推理段流式开始 → completed 的客户端墙钟时长；格式化走 XYe，en 窄单位（"2s" / "1m 5s"）。
 *
 * ⚠️ 未实测（SPEC §13.1）：推理块的 **16×16 块头图标**未知（候选 sparkles / brain 均无证据）
 *    → 本实现**不渲染图标**（icon 缺省），不用近似图标顶替。
 * ⚠️ 实测给出两处不同的渐隐距离：§3.2 的 ScrollArea 是 1.5rem、§3.2 的 AutoHeightScroller 是
 *    `[--edge-fade-distance:1rem]`。取**内层实际滚动容器**的 **1rem**（类名直接落在它身上）。
 */

/** 极简 markdown：段落 / 标题 / 无序·有序列表 / 行内 code（样式出处 SPEC §3.3 + §3.4） */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((chunk, index) => {
    if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2) {
      return (
        <code className="cx-thought__inline-code" key={`${keyPrefix}-${index}`}>
          {chunk.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={`${keyPrefix}-${index}`}>{chunk}</Fragment>;
  });
}

export function ReasoningMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li className="cx-thought__li" key={index}>
        {renderInline(item, `li-${blocks.length}-${index}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol
          className="cx-thought__list cx-thought__list--ordered"
          data-depth={list.items.length}
          key={blocks.length}
        >
          {items}
        </ol>
      ) : (
        <ul className="cx-thought__list" key={blocks.length}>
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <h1 className="cx-thought__heading" key={blocks.length}>
            {renderInline(heading[2], `h-${blocks.length}`)}
          </h1>
        ) : level === 2 ? (
          <h2 className="cx-thought__heading" key={blocks.length}>
            {renderInline(heading[2], `h-${blocks.length}`)}
          </h2>
        ) : (
          <h3 className="cx-thought__heading" key={blocks.length}>
            {renderInline(heading[2], `h-${blocks.length}`)}
          </h3>
        ),
      );
      continue;
    }
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { items: [], ordered: isOrdered };
      }
      list.items.push((unordered ?? ordered)?.[1] ?? "");
      continue;
    }
    if (line.trim() === "") {
      flushList();
      continue;
    }
    flushList();
    blocks.push(
      <p className="cx-thought__p" key={blocks.length}>
        {renderInline(line, `p-${blocks.length}`)}
      </p>,
    );
  }
  flushList();
  return <div className="cx-thought__content">{blocks}</div>;
}

/**
 * elapsed 的官方语义与格式（**包内确证**，两次逐字复核）
 * ============================================================================
 * 语义 —— sites-end-resource-ecc479065e0b.js 的 `Fw(isStreaming)`：
 *   进入流式那一刻记 startedAt = Date.now()；completed 翻牌那一刻算 Date.now() - startedAt。
 *   ⇒ 是**整个推理段的客户端墙钟时长**（不是首字延迟，也不是服务端上报值）。
 *   返回 null 的条件：从未流式过 / completed 时 startedAt 为 null / 时长 <= 0 / 格式化结果为 null。
 * 格式 —— app-primary-2b28b2369958.js@590717 的 XYe（由 `export { … XYe as Cm … }`@3208882 导出，
 *   sites-end-resource 以 `Cm as jd` 引入、在模块初始化里绑成 zw = jd，推理块调用时**只传 ms 一个参数**）：
 *   · 秒数 = floor(max(ms,0)/1000)
 *   · < 1s  → null（underOneSecond 默认 "null"）→ 文案回落 reasoningItem.thought
 *   · < 60s → Intl.NumberFormat(locale,{style:"unit",unit:"second",unitDisplay:"narrow"})，en ⇒ "2s"
 *   · ≥ 60s → 天/时/分/秒各自窄格式再用空格连接；trimZeroUnits=false ⇒ 时/分/秒都写
 *   · locale 默认 "en"（调用点没有传第二参数）⇒ 即使 zh-CN UI，官方这里也输出 "2s" 这种窄格式。
 * ⚠️ 因此本实现把 locale 钉成 "en"（与调用点一致），而不是取 document 语言 —— 取后者会 deviate。
 */
export function ReasoningBlock({ block }: { block: ReasoningNode }) {
  const { content, status } = block;
  const streaming = status === "running";
  const fade = useScrollFadeMask<HTMLDivElement>("1rem", { reverse: streaming });

  /**
   * 2026-10-20（用户：既然默认显示了思考过程，就不用写「已完成思考」）：
   * 去掉块头，直接把思考正文摊开显示（顶部仍是一个 140px 的滚动视口 + 渐隐）。
   * 原来那行 `已完成思考 ⌄` 既占位置又和正文重复；折叠/展开这层交互也随之取消 ——
   * 想看摘要的需求本来就不存在（用户要的是能读到的思考）。
   */
  if (content.trim() === "") return null;
  return (
    <div className="cx-thought" data-status={status}>
      <div
        className="cx-thought__scroll"
        data-autoscroll={streaming ? "true" : "false"}
        ref={fade.ref}
        style={fade.maskImage ? { maskImage: fade.maskImage } : undefined}
      >
        <div className="cx-thought__items">
          <ReasoningMarkdown content={content} />
        </div>
      </div>
    </div>
  );
}
