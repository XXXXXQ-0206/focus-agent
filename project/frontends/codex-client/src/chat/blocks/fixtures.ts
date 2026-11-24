import { parseUnifiedDiff } from "./DiffBlock";
import type { BlockNode } from "./types";

/**
 * 自测台数据（仅开发用）：把 11 类块的**典型态与边界态**都铺一遍。
 *
 * ⚠️ 这里的文案/内容都是**造出来的样例数据**，不是官方会话内容；
 *    用于核对"块长什么样"，不构成任何证据。
 */

const ESC = "\u001b";

/** 伪终端彩色输出：覆盖 16 色、亮色、粗体、真彩、\r 复写 */
export const ANSI_SAMPLE = [
  `${ESC}[1m>${ESC}[0m building ${ESC}[36martex${ESC}[0m …`,
  `${ESC}[32m✓${ESC}[0m compiled ${ESC}[1m42${ESC}[0m modules in ${ESC}[33m1.24s${ESC}[0m`,
  `${ESC}[31merror${ESC}[0m TS2345: Argument of type 'string' is not assignable`,
  `  ${ESC}[90m  at src/chat/blocks/ExecBlock.tsx:98:23${ESC}[0m`,
  `${ESC}[38;5;208mwarning${ESC}[0m unused variable 'foo' ${ESC}[2m(dim)${ESC}[0m`,
  `${ESC}[38;2;131;195;255mtruecolor${ESC}[0m / ${ESC}[7mreverse${ESC}[0m / ${ESC}[4munderline${ESC}[0m`,
  `progress ${ESC}[35m██████████████${ESC}[0m 100%`,
  `${ESC}[44m${ESC}[97m INFO ${ESC}[0m ${ESC}[34mblue bg${ESC}[0m`,
].join("\n");

/** 带 \r 复写的进度条样例（走 normalizeCarriageReturns） */
export const ANSI_CR_SAMPLE = [
  `step 1 \rstep 2 \rstep 3 \r${ESC}[32mdone${ESC}[0m`,
  `${ESC}[33m50%${ESC}[0m \r${ESC}[32m100%${ESC}[0m`,
].join("\n");

const ROUTE_PATCH = `@@ -1,7 +1,8 @@
 import { useEffect } from "react";
-import { useState } from "react";
+import { useCallback, useMemo, useState } from "react";
 
 export function useThing(input) {
-  const value = input;
-  return value;
+  const [state, setState] = useState(input);
+  const doubled = useMemo(() => state * 2, [state]);
+  const reset = useCallback(() => setState(input), [input]);
+  return { doubled, reset, state };
 }
`;

export const FIXTURES: BlockNode[] = [
  {
    content:
      "We need to check how the official package renders the activity header.\n\nFirst, **find the disclosure shell** in the bundle:\n\n1. grep `tool-activity-disclosure`\n2. read the JSX literal\n3. cross-check with the live DOM\n\nThe header is `inline-flex` with a full-row `button` overlay, and the body is a framer-motion `motion.div` animating `height` and `opacity`.",
    elapsed: "8s",
    id: "reasoning-1",
    kind: "reasoning",
    status: "completed",
  },
  {
    content: "Streaming reasoning: the body auto-scrolls to bottom and is capped at 140px.",
    defaultExpanded: true,
    id: "reasoning-2",
    kind: "reasoning",
    status: "running",
  },
  {
    command: "npx tsc -b --noEmit && npx biome check src/chat/blocks && npx vite build",
    id: "exec-1",
    kind: "exec",
    output: ANSI_SAMPLE,
    exitCode: 0,
    shell: "PowerShell",
    status: "completed",
  },
  {
    command: 'pwsh -c "Get-ChildItem -Recurse | Select-Object -First 400"',
    id: "exec-2",
    kind: "exec",
    output: Array.from(
      { length: 40 },
      (_, i) => `-${String(i).padStart(3, "0")}  dist/assets/chunk-${i}.js`,
    ).join("\n"),
    exitCode: 0,
    shell: "Shell",
    status: "completed",
  },
  {
    command: "node tools/analyze-blocks.mjs --live",
    id: "exec-3",
    kind: "exec",
    output: `${ESC}[31mEXCEPTION:${ESC}[0m no page target on 9223`,
    exitCode: 1,
    shell: "Bash",
    status: "failed",
  },
  {
    command: "npx vite build",
    id: "exec-4",
    kind: "exec",
    output: `${ESC}[32m✓${ESC}[0m built in 4.2s`,
    shell: "Shell",
    status: "running",
  },
  {
    id: "terminal-1",
    kind: "terminal",
    shell: "Shell",
    status: "completed",
    text: `${ANSI_SAMPLE}\n${ANSI_CR_SAMPLE}`,
  },
  {
    defaultExpanded: true,
    files: [
      {
        added: 22,
        deleted: 17,
        id: "file-1",
        lines: parseUnifiedDiff(ROUTE_PATCH),
        path: "src/chat/blocks/Disclosure.tsx",
      },
      {
        added: 3,
        deleted: 0,
        id: "file-2",
        lines: parseUnifiedDiff(`@@ -10,3 +10,6 @@
 export const DISCLOSURE_TRANSITION = {
   duration: 0.2,
 };
+// 推断，未实测
+// 官方 easing 有出处，duration 没有
`),
        path: "blocks.css",
      },
    ],
    id: "file-edit-1",
    kind: "file-edit",
    status: "completed",
  },
  {
    defaultExpanded: true,
    id: "diff-1",
    kind: "diff",
    lines: parseUnifiedDiff(ROUTE_PATCH),
    path: "src/chat/blocks/Disclosure.tsx",
    status: "completed",
  },
  {
    code: `import type { ReactNode } from "react";

/** 通用块骨架：SPEC §2 */
export function ActivityDisclosure(props: {
  status: "running" | "completed";
  summary: ReactNode;
  children: ReactNode;
}) {
  const expanded = props.status === "running";
  return (
    <div className="cx-block">
      <div className="cx-activity-header">
        <button aria-expanded={expanded} type="button" />
        <span className="cx-activity-header__summary">{props.summary}</span>
      </div>
      {expanded ? props.children : null}
    </div>
  );
}
`,
    id: "code-1",
    kind: "code",
    language: "tsx",
  },
  {
    code: `npx tsc -b --noEmit
npx biome check src/chat/blocks
npx vite build`,
    id: "code-2",
    kind: "code",
    language: "bash",
    wrap: true,
  },
  {
    action: "运行命令 npx vite build",
    defaultExpanded: true,
    id: "approval-1",
    kind: "approval",
    reason: "构建命令会写入 dist/，属于文件系统修改。",
    risk: "medium",
    status: "inProgress",
  },
  {
    action: "删除 dist 目录",
    defaultExpanded: true,
    id: "approval-2",
    kind: "approval",
    response: "denied",
    status: "denied",
  },
  {
    defaultExpanded: true,
    explanation: "先把 11 类块铺完，再做接入。",
    id: "plan-1",
    kind: "plan",
    status: "running",
    steps: [
      { status: "completed", step: "读完 SPEC 的 11 类块" },
      { status: "in_progress", step: "实现通用骨架 + 折叠展开" },
      { status: "pending", step: "接入 ChatConversation（cx-behavior）" },
    ],
  },
  {
    action: "searching",
    defaultExpanded: true,
    id: "search-1",
    kind: "search",
    query: 'data-testid="exec-shell-body"',
    results: [
      { line: 'data-testid="exec-shell-body"', lineNumber: 233, path: "docs/SPEC-CONVERSATION-BLOCKS.md" },
      { line: "cx-exec", lineNumber: 61, path: "src/chat/blocks/ExecBlock.tsx" },
    ],
    status: "completed",
  },
  {
    defaultExpanded: true,
    id: "error-1",
    kind: "error",
    message: "TypeError: Cannot read properties of undefined (reading 'animate')",
    additionalDetails: "channel: local-conversation · turn: 12",
    status: "failed",
    title: "System error",
  },
  {
    id: "error-2",
    kind: "error",
    reconnecting: { attempt: 3, total: 5 },
    status: "running",
    title: "Stream error",
  },
];
