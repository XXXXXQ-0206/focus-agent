import { useCallback, useEffect, useRef, useState } from "react";

import { CodexCheck, CodexCopy } from "@/icons";
import { cn } from "@/lib/utils";

/**
 * 代码块。
 *
 * 视觉按官方 token 落地（tokens.css 原文）：
 *   --codeblock-background-color = var(--gray-25)   → dark 下 #101010
 *   --codeblock-syntax-1..5                          → 5 色语法高亮
 *   等宽字体 var(--font-mono)（--font-code-family）
 *
 * SPEC §15 明确「会话态代码块未实测（当时会话内容太短）」，
 * 所以**工具条与语法配色属于 token 层落地，不是实测几何**，已在交付说明中标注。
 * 交互（复制 + 已复制反馈）与键盘可达性按本工程规范补齐。
 */

interface Token {
  text: string;
  kind: "plain" | "comment" | "string" | "keyword" | "number" | "function";
}

const KEYWORDS =
  /^(const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|await|async|try|catch|finally|throw|typeof|instanceof|interface|type|enum|public|private|readonly|static|void|null|undefined|true|false|this|super|of|in|do|switch|case|break|continue|yield|as|satisfies)$/;

function tokenize(code: string): Token[] {
  const out: Token[] = [];
  // 顺序敏感：注释 → 字符串 → 数字 → 标识符/关键字 → 其它
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)|([\s\S])/g;
  let match = re.exec(code);
  while (match) {
    const [raw, comment, str, num, ident] = match;
    if (comment) out.push({ text: raw, kind: "comment" });
    else if (str) out.push({ text: raw, kind: "string" });
    else if (num) out.push({ text: raw, kind: "number" });
    else if (ident)
      out.push({
        text: raw,
        kind: KEYWORDS.test(ident) ? "keyword" : code[re.lastIndex] === "(" ? "function" : "plain",
      });
    else out.push({ text: raw, kind: "plain" });
    match = re.exec(code);
  }
  return out;
}

export function CodeBlock({
  className,
  code,
  language,
}: {
  className?: string;
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 无剪贴板权限时退化到 execCommand，仍给出反馈
      const area = document.createElement("textarea");
      area.value = code;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  const tokens = tokenize(code);

  return (
    <figure className={cn("cx-codeblock", className)}>
      <figcaption className="cx-codeblock__toolbar">
        <span className="cx-codeblock__lang">{language || "text"}</span>
        <button
          aria-label={copied ? "已复制" : "复制代码"}
          className="cx-codeblock__copy"
          onClick={copy}
          type="button"
        >
          {copied ? <CodexCheck size={16} /> : <CodexCopy size={16} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </figcaption>
      <pre className="cx-codeblock__pre">
        <code>
          {tokens.map((token, index) => (
            <span className={`cx-codeblock__token cx-codeblock__token--${token.kind}`} key={index}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
