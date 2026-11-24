import type { CSSProperties, ReactElement } from "react";

import { CodexPencil } from "@/icons";
import { ActivityDisclosure } from "./Disclosure";
import type { DiffBlockNode, DiffLine } from "./types";

/**
 * diff / 补丁预览块（SPEC §7，**完整实测**）
 * ============================================================================
 * 官方把 Pierre 的 `<diffs-container>`（open shadow root）挂进来，并把 Focus 覆盖 CSS
 * 用 `unsafeCSS` 注入 shadow root（SPEC §7.2 已实证）。
 *
 * **我们不复刻 shadow DOM**（task-13 明确要求）：按 SPEC §7.2 的 `:host` 变量
 * 与行 DOM 结构自建等价行渲染器 ——
 *
 *   pre[data-diff=""][data-indicators="bars"][data-background=""][data-diff-type="single"][data-overflow="scroll"]
 *   └─ code[data-code=""][data-unified=""]
 *      └─ div[data-gutter=""]
 *         ├─ div[data-line-type="context"][data-column-number="161"][data-line-index="160,160"]
 *         │  └─ span[data-line-number-content=""] → "161"
 *         ├─ div[data-line-type="change-deletion"] / [data-line-type="change-addition"]
 *         └─ div[data-separator="simple"]
 *
 * 变量值（SPEC §7.2 逐字）：`--diffs-fg:#fcfcfc; --diffs-bg:#111111;
 * --diffs-addition-color:#00a240; --diffs-deletion-color:#e02e2a` —— 见 blocks.css 的 .cx-diff。
 * 滚动区 `max-height: 240px`（`max-h-60`，SPEC §6.2 / §7 实测）。
 *
 * ⚠️ 推断项（SPEC 未给）：
 *   • 行背景 `--diffs-bg-addition` / `--diffs-bg-deletion` 的具体混色比例（Pierre 内部变量，SPEC 未列）
 *   • "bars" 指示条与列号的几何 —— 只确证 `data-indicators="bars"` 与
 *     `[data-column-number]{padding-inline-start: calc(var(--spacing)*10)}`（§7.3）
 *   • 行内容元素的属性名（§7.2 的 dump 只列出了 `[data-line-number-content]`）
 */

/** 便捷解析（推断实现）：把 unified diff 文本切成 SPEC §7.2 的行模型 */
export function parseUnifiedDiff(patch: string): DiffLine[] {
  const lines = patch.split(/\r?\n/);
  const out: DiffLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  for (const line of lines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      out.push({ content: line, type: "separator" });
      continue;
    }
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      out.push({ content: line.slice(1), newNumber, oldNumber: null, type: "change-addition" });
      newNumber += 1;
      continue;
    }
    if (line.startsWith("-")) {
      out.push({ content: line.slice(1), newNumber: null, oldNumber, type: "change-deletion" });
      oldNumber += 1;
      continue;
    }
    out.push({ content: line.replace(/^ /, ""), newNumber, oldNumber, type: "context" });
    oldNumber += 1;
    newNumber += 1;
  }
  return out;
}

/**
 * 列号列宽 —— 按官方规则**派生**，不再用自定常量。
 * 官方出处（源码级 + 真机级两条）：
 *   · 真机值：captures/tokens.runtime.json —— `--diffs-min-number-column-width = 4ch`
 *   · 派生规则：app-initial-25361a10f2bf.js @1157236
 *       style: `--diffs-min-number-column-width-default:${String(maxLineNumber).length}ch`
 *     （即按**最大行号的位数**给 ch 数）
 * 我们按同一条规则算，并把它挂到 .cx-diff 上；CSS 侧再补上本实现列号单元格的
 * padding-inline-end 8px（官方那部分内边距在 Pierre 的 shadow DOM 里，**未实测**）。
 */
function numberColumnWidth(lines: DiffLine[]): string {
  let digits = 0;
  for (const line of lines) {
    const value = line.type === "change-deletion" ? line.oldNumber : line.newNumber;
    const length = value == null ? 0 : String(value).length;
    if (length > digits) digits = length;
  }
  return `${Math.max(digits, 1)}ch`;
}

/** Pierre 等价的 unified 行渲染器（无 shadow DOM） */
export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre
      className="cx-diff"
      data-background=""
      data-diff=""
      data-diff-type="single"
      data-indicators="bars"
      data-overflow="scroll"
      style={{ "--diffs-min-number-column-width": numberColumnWidth(lines) } as CSSProperties}
    >
      <code className="cx-diff__code" data-code="" data-unified="">
        <div className="cx-diff__gutter" data-gutter="">
          {lines.map((line, index) => {
            if (line.type === "separator") {
              return <div className="cx-diff__separator" data-separator="simple" key={index} />;
            }
            const columnNumber = line.type === "change-deletion" ? line.oldNumber : line.newNumber;
            return (
              <div
                className="cx-diff__line"
                data-column-number={columnNumber == null ? "" : String(columnNumber)}
                data-line-index={`${line.oldNumber ?? ""},${line.newNumber ?? ""}`}
                data-line-type={line.type}
                key={index}
              >
                <span className="cx-diff__number" data-line-number-content="">
                  {columnNumber ?? ""}
                </span>
                <span className="cx-diff__text" data-line-content="">
                  {line.content}
                </span>
              </div>
            );
          })}
        </div>
      </code>
    </pre>
  );
}

/** SPEC §7.4 的失败 / 二进制 / 改名 / 过大四态（**实测**的类名与文案） */
export function DiffFallback({
  state,
  text,
}: {
  state: "binary" | "renamed" | "failed" | "tooLarge";
  text: string;
}) {
  if (state === "failed") {
    return <div className="cx-diff__failed">{text}</div>;
  }
  if (state === "tooLarge") {
    return <div className="cx-diff__too-large">{text}</div>;
  }
  return <div className="cx-diff__empty">{text}</div>;
}

export function DiffBlock({ block }: { block: DiffBlockNode }) {
  const { path, status } = block;
  let fallback: ReactElement | null = null;
  if (block.renderFailed) fallback = <DiffFallback state="failed" text="Diff failed to render" />;
  else if (block.binary) fallback = <DiffFallback state="binary" text="Binary file not shown" />;
  else if (block.renamedWithoutChanges)
    fallback = <DiffFallback state="renamed" text="File renamed without changes" />;
  else if (block.tooLarge) fallback = <DiffFallback state="tooLarge" text="Too large to render inline" />;

  return (
    <ActivityDisclosure
      active={status === "running"}
      bodyVariant="default"
      icon={<CodexPencil size={16} />}
      indent={false}
      itemId={block.id}
      status={status}
      defaultExpanded={block.defaultExpanded}
      summary={
        block.summary ?? (
          <>
            <span className="cx-summary__action">查看变更</span>{" "}
            <span className="cx-summary__detail">{path}</span>
          </>
        )
      }
    >
      <div className="cx-diffcard">
        <div className="cx-diffcard__head">
          <div className="cx-diffcard__name">
            <span className="cx-diffcard__path">{path}</span>
          </div>
        </div>
        <div className="cx-diffcard__scroll">{fallback ?? <DiffLines lines={block.lines} />}</div>
      </div>
    </ActivityDisclosure>
  );
}
