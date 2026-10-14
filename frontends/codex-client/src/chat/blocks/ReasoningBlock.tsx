import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import { ActivityDisclosure } from "./Disclosure";
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

/**
 * 文案：**官方 zh-CN 原文**（不再是推断译文）。
 * 出处：官方包 zh-CN 语言块 zh-CN-b05cfd55c534.js@1301169 起的三条字面量 ——
 *   "reasoningItem.thinking": "正在思考"
 *   "reasoningItem.thought": "已完成思考"
 *   "reasoningItem.thoughtWithElapsed": "已思考 {elapsed}"
 * en 文案（sites-end-resource-ecc479065e0b.js 的 Nw）：Thinking / Thought / Thought for {elapsed}
 */
const REASONING_LABELS = {
  thinking: "正在思考",
  thought: "已完成思考",
  thoughtWithElapsed: (elapsed: string) => `已思考 ${elapsed}`,
};

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
function narrowUnit(value: number, unit: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(value);
}

function formatElapsed(ms: number, locale = "en"): string | null {
  const seconds = Math.floor(Math.max(ms, 0) / 1000);
  if (seconds < 1) return null;
  if (seconds < 60) return narrowUnit(seconds, "second", locale);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days > 0 || hours > 0) {
    const parts: string[] = [];
    if (days > 0) parts.push(narrowUnit(days, "day", locale));
    parts.push(narrowUnit(hours, "hour", locale));
    parts.push(narrowUnit(minutes, "minute", locale));
    parts.push(narrowUnit(rest, "second", locale));
    return parts.join(" ");
  }
  return [narrowUnit(minutes, "minute", locale), narrowUnit(rest, "second", locale)].join(" ");
}

/**
 * 官方 Fw 的等价实现（组件内计时，官方同样把它放在推理组件里）。
 * 与官方逐条对齐：挂载时若已在流式则先记一次起点；进入流式重置起点与耗时；离开流式结算一次。
 * 这段计时**不是**从 runtime 里算的 —— block-adapter 是纯函数、RuntimeMessage 也没有推理段时间戳，
 * 所以只能量到「组件看到的 streaming → completed」。官方也是组件内量，口径一致。
 */
function useReasoningElapsed(streaming: boolean): string | null {
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() => (streaming ? Date.now() : null));
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const wasStreaming = useRef(streaming);

  useEffect(() => {
    const previous = wasStreaming.current;
    if (!previous && streaming) {
      // 进入流式：起点 = 现在，上一段耗时作废
      setStartedAtMs(Date.now());
      setElapsedMs(null);
    } else if (previous && !streaming && startedAtMs != null && elapsedMs == null) {
      // 离开流式：结算一次（elapsedMs == null 保证只结算一次）
      setElapsedMs(Date.now() - startedAtMs);
      setStartedAtMs(null);
    }
    wasStreaming.current = streaming;
  }, [streaming, startedAtMs, elapsedMs]);

  if (elapsedMs == null || elapsedMs <= 0) return null;
  return formatElapsed(elapsedMs);
}

export function ReasoningBlock({ block }: { block: ReasoningNode }) {
  const { content, elapsed, status } = block;
  const streaming = status === "running";
  const fade = useScrollFadeMask<HTMLDivElement>("1rem", { reverse: streaming });
  // 节点自带 elapsed（fixtures / 将来的服务端值）优先；否则用组件内实测（官方口径）。
  const measured = useReasoningElapsed(streaming);
  const shownElapsed = elapsed ?? measured ?? undefined;
  const label = streaming
    ? REASONING_LABELS.thinking
    : shownElapsed
      ? REASONING_LABELS.thoughtWithElapsed(shownElapsed)
      : REASONING_LABELS.thought;

  return (
    <ActivityDisclosure
      active={streaming}
      bodyVariant="default"
      indent={false}
      itemId={block.id}
      status={status}
      summary={label}
      summaryTone="dim"
      defaultExpanded={block.defaultExpanded}
    >
      <div className="cx-thought">
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
    </ActivityDisclosure>
  );
}
