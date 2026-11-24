/**
 * Markdown 渲染。
 *
 * 会话内容来自不同模型，表格、任务列表、删除线和自动链接都属于 GFM。
 * 解析交给 remark-gfm，本文件只负责把标准节点映射到 Codex 的视觉结构，
 * 不再维护容易漏边界情况的自研 Markdown 语法子集。
 */

import type { Root } from "mdast";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

type TableNode = {
  type: string;
  align?: ("left" | "center" | "right" | null)[] | null;
  children?: TableNode[];
  data?: Record<string, unknown>;
};

function remarkTableCellAlignment() {
  return (tree: Root) => {
    const visit = (node: TableNode) => {
      if (node.type === "table" && node.align) {
        for (const row of node.children ?? []) {
          row.children?.forEach((cell, index) => {
            const align = node.align?.[index];
            if (!align) return;
            const data = cell.data ?? {};
            data.hProperties = {
              ...(data.hProperties as Record<string, unknown> | undefined),
              "data-align": align,
            };
            cell.data = data;
          });
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree as TableNode);
  };
}

const REMARK_PLUGINS = [remarkGfm, remarkTableCellAlignment];

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${Math.min(level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
  return ({ children }: { children?: ReactNode }) => (
    <Tag className="cx-markdown__heading" data-level={level}>
      {children}
    </Tag>
  );
}

const COMPONENTS: Components = {
  a: ({ children, node: _node, ...props }) => (
    <a className="cx-markdown__link" rel="noreferrer" target="_blank" {...props}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="cx-markdown__quote">{children}</blockquote>,
  code: ({ children, node: _node, ...props }) => (
    <code className="cx-markdown__code" {...props}>
      {children}
    </code>
  ),
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  hr: () => <hr className="cx-markdown__hr" />,
  ol: ({ children }) => <ol className="cx-markdown__list">{children}</ol>,
  p: ({ children }) => <p className="cx-markdown__paragraph">{children}</p>,
  pre: ({ children }) => {
    const codeElement = Children.toArray(children).find((child) => isValidElement(child));
    if (!isValidElement<{ children?: ReactNode; className?: string }>(codeElement)) {
      return <pre>{children}</pre>;
    }
    const language = /language-([^\s]+)/.exec(codeElement.props.className ?? "")?.[1];
    const code = textContent(codeElement.props.children).replace(/\n$/, "");
    return <CodeBlock code={code} language={language} />;
  },
  table: ({ children }) => (
    <div className="cx-markdown__table-wrap">
      <table className="cx-markdown__table">{children}</table>
    </div>
  ),
  ul: ({ children }) => <ul className="cx-markdown__list">{children}</ul>,
};

export function Markdown({ className, content }: { className?: string; content: string }) {
  return (
    <div className={cn("cx-markdown", className)}>
      <ReactMarkdown components={COMPONENTS} remarkPlugins={REMARK_PLUGINS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
