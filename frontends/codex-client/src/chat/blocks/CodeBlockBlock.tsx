import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CodexCheck } from "@/icons";
import { CopyButton } from "./CopyButton";
import { PreviewToggleIcon, ScrollToBottomIcon, WrapToggleIcon } from "./icons";
import type { CodeNode } from "./types";

/**
 * markdown 围栏代码块（SPEC-CONVERSATION-BLOCKS §11，**完整实测**）
 * ============================================================================
 * 官方 DOM（SPEC §11.1，逐层）：
 *   div.relative.w-full.min-w-0.overflow-clip.contain-inline-size
 *       .rounded-(--radius-3xl-base).border.border-subtle.text-default
 *       ._CodeSurface_snnl5_22._Surface_snnl5_1._CodeBlock_176oq_2
 *       [data-markdown-copy="code-block"][data-markdown-copy-text=<code>][data-theme="dark"]  {736×101}
 *   ├─ 工具条 div.flex.items-center.font-sans.text-sm.select-none.min-h-12.gap-2.py-1.5.ps-4.pe-1.5
 *   │    .font-medium.text-default.md:ps-5.sticky.z-10._StickyActionBar_snnl5_10[data-markdown-copy="exclude"] {735×48}
 *   │    ├─ svg[20×20] 语言图标（名称未实测 → 不渲染，留 languageIcon 插槽）
 *   │    ├─ div.min-w-0.flex-1.truncate 语言标签
 *   │    └─ 换行按钮 36×36 [aria-label][aria-pressed] + 复制按钮 36×36
 *   └─ 正文 div.text-size-chat.overflow-auto.outline-none.px-4.pt-0.pb-3.md:px-5  {735×52}
 *      └─ code.whitespace-pre!.block.text-size-code
 *
 * 本轮新增的两项（SPEC §11.3 的状态表），依据 = 官方渲染代码：
 *  chatgpt-code-block-b5d561b77f27.js（JS 字符串下标）：
 *   @38750  chatgpt.codeBlocks.preview.ariaLabel  默认文案 Preview   ← 切到预览态
 *   @39036  chatgpt.codeBlocks.showCode.ariaLabel 默认文案 Code      ← 切回源码态
 *   @41200  trailingActionButtons: V && !m ? Tooltip(tooltipContent = 当前态的反向文案) >
 *           Button{ "aria-label": 同一文案, color:"ghostActive", size:"imageToolbar",
 *                   uniform:true, onClick: 切换 code/preview }
 *   @27080  预览窗格 div[data-code-block-preview-pane=<language>]
 *           className = cn("group pointer-events-auto flex w-full overflow-hidden",
 *                           language==="svg" && "min-h-24", 其它 && "aspect-video")
 *   @25716  svg 预览是**当图片渲染**的：<img className="block min-h-24 w-full object-contain">
 *           （同处还有 renderSvgAsImage: mode !== "code"，互为佐证）
 *   @13504  Scroll to bottom：chatgpt.codeBlocks.editorPane.scrollToBottom 默认文案 Scroll to bottom；
 *           渲染成 <按钮 className="bottom-4" label={该文案} show={…} onClick={回到最新} />
 *   同时官方在预览态隐藏复制/换行按钮：showCopyButton = !streaming && mode !== "preview"
 *
 * 证据边界（**不得宣称与 Codex 一致**）：
 *   · 计划/代码块 UI 无运行时实测（SPEC §13）。**预览窗格与工具的几何未实测**，
 *     这里只搬运官方类串（min-h-24 / aspect-video / w-full overflow-hidden）与文案。
 *   · Scroll to bottom 按钮**自身的尺寸/配色/图标未取到**（官方只给出 bottom-4 与文案）。
 *     本实现按同一工具条已实测的 36×36 圆钮规格落地，标 data-evidence="derived"。
 *   · Mermaid / HTML / React 预览**不做**：官方走沙箱渲染器与 mermaid 运行时，
 *     本工程无该依赖，凭类名补一个假预览 = 造 UI。仅 svg 走官方确证的「当图片渲染」。
 */

/** SPEC §11.4 的语言标签映射表（jn 表摘录；兜底 = 代码） */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  cjs: "JavaScript",
  console: "Shell",
  cts: "TypeScript",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  golang: "Go",
  gyp: "Python",
  html: "HTML",
  ipython: "Python",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSON",
  jsx: "JavaScript",
  kt: "Kotlin",
  kts: "Kotlin",
  mermaid: "Mermaid",
  mjs: "JavaScript",
  patch: "Diff",
  plaintext: "Plain text",
  powershell: "PowerShell",
  ps: "PowerShell",
  ps1: "PowerShell",
  pwsh: "PowerShell",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  sh: "Bash",
  shell: "Shell",
  shellsession: "Shell",
  sql: "SQL",
  svg: "SVG",
  swift: "Swift",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TypeScript",
  txt: "Plain text",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

export function languageLabel(language?: string) {
  if (!language) return "代码";
  const key = language.toLowerCase();
  return LANGUAGE_LABELS[key] ?? (key.length <= 4 ? key.toUpperCase() : "代码");
}

/** 官方对 svg 预览的处理：当图片渲染（无脚本执行） */
function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function CodeBlockBlock({
  block,
  languageIcon,
  renderPreview,
}: {
  block: CodeNode;
  /** 语言图标插槽：官方是 20×20，**名称未实测** → 缺省不渲染 */
  languageIcon?: ReactNode;
  /** 自定义预览渲染器（mermaid / html / react 等需要沙箱或运行时的语言）；
   *  不传时只有 svg 可预览（官方确证的那条路径）。 */
  renderPreview?: (block: CodeNode) => ReactNode;
}) {
  const [wrap, setWrap] = useState(block.wrap ?? false);
  const [mode, setMode] = useState<"code" | "preview">("code");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const language = block.language?.toLowerCase();
  const isSvg = language === "svg";
  const canPreview = Boolean(renderPreview) || isSvg;

  // 切回源码态时复位预览失败标记，避免下次进预览沿用旧状态
  useEffect(() => {
    if (mode === "code") setPreviewFailed(false);
  }, [mode]);

  const onBodyScroll = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 24);
  }, []);

  const scrollToBottom = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  const previewNode = useMemo(() => {
    if (mode !== "preview") return null;
    if (renderPreview) return renderPreview(block);
    if (!isSvg) return null;
    return (
      <img
        alt={`${languageLabel(block.language)} 预览`}
        className="block min-h-24 w-full object-contain"
        onError={() => setPreviewFailed(true)}
        src={svgToDataUrl(block.code)}
      />
    );
  }, [block, isSvg, mode, renderPreview]);

  // 预览失败（svg 解析不了）时自动回落到源码态，绝不出现「两边都不渲染」的空块
  const showPreviewPane = mode === "preview" && previewNode != null && !previewFailed;
  const showCodeBody = !showPreviewPane;
  // ⚠️ 推导：官方按「流式中 && 不在底部」显示（chatgpt-code-block @13504 的 `l && ee`）；
  //    我们的 CodeNode 没有流式标志，所以只保留「滚离底部就出现」这一半语义。
  const scrollable = showCodeBody && !atBottom;

  return (
    <div
      className="cx-block"
      data-local-conversation-item-target-ids={block.id}
      data-spacing="item"
      tabIndex={-1}
    >
      <div className="cx-block__col">
        <div
          className="cx-codefence"
          data-markdown-copy="code-block"
          data-markdown-copy-text={block.code}
          data-theme="dark"
        >
          <div className="cx-codefence__bar" data-markdown-copy="exclude">
            {languageIcon ? <span className="cx-codefence__lang-icon">{languageIcon}</span> : null}
            <div className="cx-codefence__lang">{languageLabel(block.language)}</div>
            <div className="cx-codefence__actions">
              <div className="cx-codefence__actions-inner">
                {canPreview ? (
                  <button
                    aria-label={showPreviewPane ? "Code" : "Preview"}
                    aria-pressed={showPreviewPane}
                    className="cx-codefence__action cx-codefence__action--toggle"
                    data-active={showPreviewPane ? "true" : "false"}
                    onClick={() => setMode((value) => (value === "preview" ? "code" : "preview"))}
                    title={showPreviewPane ? "Code" : "Preview"}
                    type="button"
                  >
                    <PreviewToggleIcon preview={mode === "preview"} />
                  </button>
                ) : null}
                {mode !== "preview" ? (
                  <>
                    <button
                      aria-label={wrap ? "禁用自动换行" : "启用自动换行"}
                      aria-pressed={wrap}
                      className="cx-codefence__action"
                      onClick={() => setWrap((value) => !value)}
                      type="button"
                    >
                      <WrapToggleIcon />
                    </button>
                    <CopyButton
                      className="cx-codefence__action"
                      copiedIcon={<CodexCheck size={16} />}
                      label="复制"
                      text={block.code}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {showPreviewPane ? (
            <div
              className="cx-codefence__preview"
              data-code-block-preview-pane={language}
              data-mermaid={language === "mermaid" ? "true" : undefined}
            >
              <div className="cx-codefence__preview-inner">{previewNode}</div>
            </div>
          ) : null}

          {showCodeBody ? (
            <div className="cx-codefence__body" onScroll={onBodyScroll} ref={bodyRef}>
              <code className="cx-codefence__code" data-wrap={wrap ? "true" : "false"}>
                {block.code}
              </code>
            </div>
          ) : null}

          {scrollable ? (
            <button
              aria-label="Scroll to bottom"
              className="cx-codefence__to-bottom"
              data-evidence="derived"
              onClick={scrollToBottom}
              title="Scroll to bottom"
              type="button"
            >
              <ScrollToBottomIcon />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
