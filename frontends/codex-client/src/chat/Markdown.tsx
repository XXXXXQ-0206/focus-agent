/**
 * Markdown 渲染。
 *
 * 官方用 `_MarkdownRoot_176oq_2` + `_Paragraph_176oq_2` 这类 CSS Modules 类名，
 * 并带 `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0`（首末子元素 margin 归零，实测）。
 * 这里按同一语义实现：块级解析 + 行内解析，覆盖会话里会出现的子集
 * （标题 / 段落 / 有序无序列表 / 引用 / 分隔线 / 围栏代码块 / 行内代码 / 粗斜体 / 链接）。
 * 不引第三方 Markdown 库：官方是自研 root + 组件化块，保持发行形态一致。
 */
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "hr" };

const FENCE = /^```(.*)$/;
const FENCE_END = /^```\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(---|\*\*\*|___)\s*$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1].trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_END.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", language, code: body.join("\n") });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }
    const unordered = line.match(UL);
    const ordered = line.match(OL);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const match = isOrdered ? lines[i].match(OL) : lines[i].match(UL);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !FENCE.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code className="cx-markdown__code" key={index}>
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a className="cx-markdown__link" href={link[2]} key={index} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function Markdown({ className, content }: { className?: string; content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className={cn("cx-markdown", className)}>
      {blocks.map((block, index) => {
        if (block.kind === "code")
          return <CodeBlock code={block.code} key={index} language={block.language} />;
        if (block.kind === "hr") return <hr className="cx-markdown__hr" key={index} />;
        if (block.kind === "heading") {
          const Tag = `h${Math.min(block.level + 1, 6)}` as "h2";
          return (
            <Tag className="cx-markdown__heading" data-level={block.level} key={index}>
              {renderInline(block.text)}
            </Tag>
          );
        }
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag className="cx-markdown__list" key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote className="cx-markdown__quote" key={index}>
              {renderInline(block.text)}
            </blockquote>
          );
        }
        return (
          <p className="cx-markdown__paragraph" key={index}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
