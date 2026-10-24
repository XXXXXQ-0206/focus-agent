import { useCallback, useEffect, useRef, useState } from "react";

import { CodexPlusLg, CodexSend, CodexStop } from "@/icons";
import type { ModelOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettings } from "@/settings/store";
import { hasComposerContent } from "./can-send";
import { ModelPickerChip } from "./ModelPicker";
import type { ChatModelOption } from "./options";
import { PermissionMenuChip } from "./PermissionMenu";
import type { ChatStatus } from "./use-chat";

/**
 * 输入区 Composer（首页态与会话态同一个组件）。
 *
 * 实测（captures/blocks-chat-home.json + blocks-conversation.json）：
 *   body        [440,698 **736×98**]  bg **rgb(54,54,54)**  **border-radius 22px**  cs SE1.5
 *               box-shadow `rgba(255,255,255,.2) 0 0 1px 0 inset`
 *   attachments [440,698 736×**14**]  padding `8px 8px 6px`
 *   footer      [440,712 736×**76**]  padding `0 8px`  margin-bottom 8  grid row-gap 5px
 *   input       [440,712 736×**44**]  文本 padding `0 12px`（内层 452 起）字体 **14px/20px/430**
 *   `+` 按钮    [448,760 **28×28**]   r 9999px  padding 0  色 rgba(255,255,255,.498)
 *   权限芯片    [481.333,760 **85.333×28**] padding `0 6px` gap 4px r 9999px 字体 13px/18px/430
 *               「完全访问」值色 **rgb(255,133,73)**（--color-text-warning = #ff8549）
 *   模型芯片    [1025.302,760 **107.03125×28**]  padding `0 8px` gap 4px r 9999px
 *   发送键      [1140.33,760 **28×28**]   r 9999px  bg **rgb(223,223,223)**；禁用态 opacity .5
 *   两组间距：左组 gap 5px（28+5+85.333 = 118.333 ✓）；右组 ms-2 = 8px（107+8+28 = 143 ✓）
 *   左右锚点：448 = 440+8（footer padding），1168 = 440+736−8 ✓
 *
 * ── #41（P1）输入区 = contenteditable div，不是 textarea ────────────────────────────
 * 官方 DOM（captures/blocks-chat-home.json block[72..75]，@1280×816）：
 *   [72] div._ComposerLayoutInput_.flex-grow.overflow-y-auto   [440.333,712 736×44]  margin `0 0 4px`
 *   [73] div.text-size-chat…_RichTextInput_juri1_1…            [440.333,712 736×44]  padding `0 12px`
 *        （官方给这一层挂 `in-[[data-composer-body]:has([data-composer-expand-toggle])]:pe-10`）
 *   [74] div.**ProseMirror**  role=**textbox**  aria=**随心输入**（= 占位符文案，不是「输入消息」）
 *        [452.333,712 712×44]  position relative  min-height 44px  fs 14px / lh 20px / 430
 *   [75] p.**placeholder**     [452.333,712 712×20]  ← 空态时**就是那唯一一个空段落**
 *
 * 类串 / 属性出处（官方 app/webview/assets/，行号即该文件内行号）：
 *   · `div.ProseMirror` —— prosemirror-view 给 EditorView 的 contentDOM 起的类名，本体在
 *     app-shared-40678a67f0e3.js（同库的 `ProseMirror-focused` :44070、`ProseMirror-trailingBreak`
 *     :43895、`ProseMirror-widget` :43521、`ProseMirror-separator` :43173 都在那里）；
 *     官方应用代码直接按这个类名取编辑器：
 *       `let t10 = e10.currentTarget.querySelector('.ProseMirror')`  （app-initial-25361a10f2bf.js:28841）
 *   · 编辑器属性 —— EditorView 的 `attributes`（app-initial-25361a10f2bf.js:187098）原文：
 *       { "aria-multiline": `true`, dir: `auto`, role: `textbox`, spellcheck: `true`, tabindex: `0` }
 *     ⇒ 本组件逐条落成 role="textbox" / aria-multiline="true" / dir="auto" / spellCheck / tabIndex={0}；
 *       aria-label = **占位符文案**（blocks-chat-home block[74].aria 实测「随心输入」，不是「输入消息」）。
 *   · `p.placeholder` + `data-placeholder` **不是静态 DOM**，而是 placeholderPlugin（hTc()，
 *     plugin key gTc = `placeholderPlugin`，app-initial-25361a10f2bf.js:187063-187076）**派生**出来的
 *     node decoration —— 这一点是 #41 那条回归的根因，展开见 readEditorValue() 的注释。
 *
 * 占位符机制（官方 CSS 原文，captures/css-pretty/shell-initial.css）：
 *   .ProseMirror .placeholder           { pointer-events:none; user-select:none; position:relative }
 *   .ProseMirror .placeholder:before    { color:var(--color-text-tertiary);
 *                                         content:attr(data-placeholder);
 *                                         opacity:var(--composer-editor-placeholder-opacity,.5);
 *                                         white-space:nowrap; text-overflow:ellipsis; max-width:100%;
 *                                         position:absolute; inset:0 0 auto; overflow:hidden }
 *   ⇒ 文案来自 **data-placeholder 属性**（不是 ::placeholder 伪元素），且**额外乘 0.5 不透明度**：
 *     --color-text-tertiary = rgba(255,255,255,.498)（tokens.runtime.json）
 *     --opacity-composer-placeholder = .5
 *     合起来等效 alpha ≈ .249；改前我们写的是 ::placeholder{color:rgba(...,.498)}（**亮一倍**）。
 *
 * 焦点环（#9）：官方**只**显式给特定控件画环，且对编辑器有专门一条
 *   ._RichTextInput_juri1_1 .ProseMirror:focus-visible{ outline:none }
 *   （captures/css-pretty/shell-initial.css；官方全库没有裸的 `:focus-visible{outline:…}` 通配规则）
 *   我们的 base.css 有一条通配 `:focus-visible{outline:2px solid var(--color-ring)}`，
 *   改前它命中 textarea（实测 outline = `2px solid rgba(131,195,255,.76)`、outline-offset 2px）。
 *   本组件按官方 DOM 换成 contenteditable div，并在 chat.css 里补上官方那条
 *   `.cx-composer__editor:focus-visible{outline:none}` —— **治因，不是遮症状**（没有动 autoFocus）。
 *
 * ── 为什么这里**没有**展开钮（audit #50 已作废）─────────────────────────────────
 * 官方 **Focus 线程**输入框根本没有 Expand/Collapse 钮 —— 本轮官方端实机采集（判决性，DOM + PNG 双证）：
 *   captures/recon-official/official-composer-01-multiline-draft-long.json
 *     草稿 557 字符 / lineCount 39 → composer[data-codex-composer] rect **702×400**
 *     （scrollHeight = clientHeight = 400 ⇒ 撑满上限 + 内部滚动，不是展开）
 *     verdict.expandTogglePresent = **false**；verdict.expandedAttrPresent = **false**
 *     verdict.candidateCount = **0**（全页 aria-label/title 含 expand|collapse|展开|收起 的按钮 0 个）
 *   三态对照（同一次采集）：0 字符 → 712×44；108 字符/9 行 → 712×100；557 字符/39 行 → 702×400
 *   对应 PNG：official-composer-00-empty / 01-multiline-draft / 01-multiline-draft-long（右上角空白）
 * 配套源码证据：该按钮的 i18n 属 **chatgptConversations.composer.expand / .collapse**
 *   （zh-CN-b05cfd55c534.js），且 expansion context 为 null 或 state === "unavailable" 时**整块不渲染**
 *   ⇒ 它是 **ChatGPT 会话输入框**的能力；Focus 线程这边没有挂这个 context。
 * 结论：本组件**不渲染** [data-composer-expand-toggle]，也**不产出** [data-expanded-composer]，
 *   因此 chat.css 里那批官方搬运规则（--composer-expanded-height / :has([data-expanded-composer])）
 *   在当前产品形态下**不可达** —— 但按 RULINGS R13 **不删**，只在 chat.css 补现况注释。
 *
 * 键位：
 *   Enter        = 发送（保持原行为）。官方在**展开态**会把 Enter 语义换成 cmdAlways
 *                  （`setEnterBehavior(_10 ? "cmdAlways" : u10)`，app-primary-2b28b2369958.js）——
 *                  但 Focus 线程 composer 没有展开钮（见上一节判决性采集），这个分支**不可达**；
 *                  且 cmdAlways 的确切键位语义**未实测**，故本实现不擅自改 Enter 语义）
 *   Shift+Enter  = 段内软换行（<br>，等价官方 ProseMirror 的 hardBreak）
 *   粘贴         = 只取 text/plain（官方编辑器是富文本，但本工程没有富文本模型；
 *                  收纯文本是本工程的能力边界，已登记）
 *   IME          = composition 期间（isComposing / keyCode 229 / key "Process"）**不拦截 Enter**
 *
 * ⚠️ 诚实边界：官方的富文本能力（@提及、斜杠命令、附件内联、表格、撤销栈）**没有复刻**，
 *    本实现是「纯文本 + 官方 DOM 外壳与占位符机制」。
 */

/* ── 编辑器文本模型（纯文本 + \n，见文件头「诚实边界」）─────────────────────── */

/** 空态 DOM，逐字对齐官方 block[75]：<p class="placeholder" data-placeholder="…"><br></p> */
function emptyBlockMarkup(placeholder: string): string {
  return `<p class="placeholder" data-placeholder="${escapeAttribute(placeholder)}"><br></p>`;
}

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** 行内文本：文本节点原样，<br> 记一个 \\n，其余元素递归 */
function readInlineText(node: Node): string {
  let text = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? "";
    else if (child instanceof HTMLElement && child.tagName === "BR") text += "\n";
    else if (child.nodeType === Node.ELEMENT_NODE) text += readInlineText(child);
  }
  return text;
}

/**
 * 读编辑器内容：顶层按「块」切，块之间补 \\n（= 官方 ProseMirror getText() 的段落语义）。
 * 空段落记为 ""，于是空态的返回值是 ""。
 *
 * ⚠️ 判据只能是**文本内容**，绝不能是 `class="placeholder"`：官方 placeholderPlugin 的 hTc()
 *    （app-initial-25361a10f2bf.js:187063-187076）只在
 *      doc.childCount===1 && firstChild.type===paragraph && firstChild.content.size===0
 *    成立时**派生**出 { class:"placeholder", "data-placeholder":… } 这个 node decoration ——
 *    类是「文档为空」的**结果**（每次 doc 变化都重算），不是「文档为空」的**判据**。
 *    把因果反过来会自我强化：文本落进那个仍带 placeholder 类的 <p> 后值仍读成 ""，于是类永远摘不掉。
 */
function readEditorValue(editor: HTMLElement | null): string {
  if (!editor) return "";
  const blocks: string[] = [];
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      blocks.push(node.textContent ?? "");
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "BR") {
      blocks.push("\n");
      continue;
    }
    // 空态哨兵：官方空态时那唯一一个 <p class="placeholder"><br></p> **就是**空段落本身，
    // 它的 <br> 不算内容 → 记 ""。⚠️ 判空必须看**内容**而不是只看类名：
    // 用户一开始打字时浏览器就是把文字插进这个段落里（ProseMirror 同理），
    // 若只按类名判定，值会永远停在 ""（实测踩过：文字进了段落但 value 不更新、
    // placeholder 类也摘不掉、发送钮一直是禁用态）。
    if (node.classList.contains("placeholder") && (node.textContent ?? "").trim() === "") {
      blocks.push("");
      continue;
    }
    blocks.push(readInlineText(node));
  }
  return blocks.join("\n");
}

/** 把整段清空后的残留规整成官方空态：唯一一个 <p class="placeholder"><br></p> */
function normalizeEmptyBlock(editor: HTMLElement): HTMLElement {
  const children = Array.from(editor.children);
  let block = children[children.length - 1] as HTMLElement | undefined;
  for (const other of children) {
    if (other !== block && other.textContent === "") other.remove();
  }
  if (block?.tagName !== "P") {
    editor.innerHTML = "";
    block = document.createElement("p");
    editor.appendChild(block);
  }
  if ((block.textContent ?? "") === "") block.innerHTML = "<br>";
  return block;
}

/** 在选区插入纯文本（优先 execCommand：能进浏览器 undo 栈） */
function insertPlainText(text: string) {
  if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 段内软换行（<br>）= 官方 ProseMirror 的 hardBreak：**直接插 <br> 元素**。
 * ⚠️ 不要用 document.execCommand("insertLineBreak")：官方 .ProseMirror 的基础样式就是
 *    `white-space: pre-wrap; white-space: break-spaces`（css-pretty/shell-initial.css 的
 *    `.ProseMirror{ word-wrap:break-word; white-space:pre-wrap; white-space:break-spaces; … }`
 *    原文，即 prosemirror.css），在这个 white-space 下 Chromium 的 insertLineBreak 会退化成
 *    插**裸换行字符**而不是 <br> —— 本机实测：<p>AAA</p> 执行后 innerHTML 变成
 *    `<p>AAA\n\n</p>`（execCommand 返回 true，但没有 <br>）。官方是 ProseMirror 自己建 DOM
 *    插 <br>，所以这里也直接插 <br>，与官方 DOM 同形。
 */
function insertSoftBreak() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  // ⚠️ 必须插**两个** <br>、把光标夹在中间：只插一个再 setStartAfter 的话，Chromium 会把
  //    选区规范化回 <br> **之前**（实测 anchorOffset 落在 <br> 前面），接着打的字会跑到
  //    换行前 —— 本机实测对照：单 <br> 方案输入 "AAA"+换行+"BBB" 得到 `<p>AAABBB<br></p>`（错），
  //    双 <br> 方案得到 `<p>AAA<br>BBB</p>`（对，且打字后尾随占位 <br> 自动消失）。
  //    这也正是 Chromium 原生 insertLineBreak 的 DOM 形状。
  const trailing = document.createElement("br");
  range.insertNode(trailing);
  const br = document.createElement("br");
  range.insertNode(br);
  range.setStartAfter(br);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** 输入区上方待发送的附件（图片会先由服务端读图再交给 Agent） */
export interface ComposerAttachment {
  id: string;
  name: string;
  size: number;
  /** 图片预览（object URL）；非图片为空 */
  previewUrl?: string;
  /** 原始文件（发送时上传用；UI 不渲染） */
  file?: File;
}

export interface ComposerSelection {
  model: ModelOption;
  /** 强度档（模型面板滑杆 / 第一行切换），默认「Ultra」 */
  effort: string;
  /** 真实模型列表（缺省 = 参考端 mock，见 options.ts CHAT_MODELS） */
  models?: ChatModelOption[];
  /** 真实强度档（缺省 = 参考端 9 档 mock） */
  efforts?: readonly string[];
  /** 最高档的标签（用于紫色高亮；缺省 = 参考端 "Ultra"） */
  maxEffort?: string;
  /** 模型选择器只读（agent 已绑定模型） */
  modelLocked?: boolean;
  modelLockedReason?: string;
  /** 模型/强度保存中 */
  savingModel?: boolean;
  /** 选择/保存失败时的一行提示（宿主写入） */
  notice?: string;
  /** 待发送附件 */
  attachments?: ComposerAttachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  setModelId: (id: string) => void;
  setEffort: (effort: string) => void;
}

export function Composer({
  autoFocus,
  className,
  disabled = false,
  mode = "home",
  onSend,
  onStop,
  placeholder = "随心输入",
  selection,
  status,
  steer = false,
}: {
  autoFocus?: boolean;
  className?: string;
  /** 只读宿主（例如历史任务会话）：禁止编辑、附件与停止操作。 */
  disabled?: boolean;
  /** 首页态 / 会话态：只影响发送钮的 aria 文案（实测见文件头） */
  mode?: "home" | "conversation";
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
  selection: ComposerSelection;
  status: ChatStatus;
  /**
   * 生成中是否允许「引导发送」（设置 → 常规 → 跟进方式 = 引导）。
   * true 时：输入框里有文字就把发送键画成发送（而不是停止），Enter / 点击都会走 onSend，
   * 由宿主先中断当前生成再发这条（见 src/chat/use-follow-up.ts）。false 时保持官方原行为：
   * 生成中只有停止键。
   */
  steer?: boolean;
}) {
  const [value, setValue] = useState("");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 「发送快捷键」（设置 → 常规）：Enter / Ctrl+Enter 二选一，跟着设置实时变
  const { enterBehavior } = useSettings();

  const streaming = status === "streaming";
  const attachmentCount = selection.attachments?.length ?? 0;
  const hasContent = hasComposerContent(value, attachmentCount);
  // 生成中 + 允许引导 + 有内容 ⇒ 发送键先于停止键。
  const steerable = !disabled && streaming && steer && hasContent;
  const showStop = !disabled && streaming && !steerable;
  const canSend = !disabled && (!streaming || steerable) && hasContent;
  const sendLabel = showStop ? "停止" : mode === "conversation" ? "继续" : "发送";

  /** 把 DOM 读回 state，并维护官方占位符挂点（placeholder 类 + data-placeholder 属性） */
  const syncEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setValue("");
      return "";
    }
    const next = readEditorValue(editor);
    if (next.trim().length === 0) {
      const block = normalizeEmptyBlock(editor);
      block.classList.add("placeholder");
      block.setAttribute("data-placeholder", placeholder);
    } else {
      for (const node of Array.from(editor.querySelectorAll("p.placeholder"))) {
        node.classList.remove("placeholder");
        node.removeAttribute("data-placeholder");
      }
    }
    setValue(next);
    return next;
  }, [placeholder]);

  const resetEditor = useCallback(() => {
    const editor = editorRef.current;
    if (editor) editor.innerHTML = emptyBlockMarkup(placeholder);
    setValue("");
  }, [placeholder]);

  /**
   * 把一段文本**整段写回**输入框（不是追加），光标落到末尾。
   *
   * 用途：排队消息行 `··· → 编辑`（见 use-follow-up.ts 的 edit()）。它必须回填到真正的
   * 编辑器 DOM 并触发 syncEditor，否则 React 侧的 `value`（决定发送键是否可用、占位符是否显示）
   * 会与 DOM 脱节。换行按编辑器自己的块模型切成多个 `<p>`（与 readEditorValue 的读法互逆）。
   */
  const setEditorText = useCallback(
    (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.innerHTML = "";
      for (const line of text.split("\n")) {
        const block = document.createElement("p");
        if (line === "") block.appendChild(document.createElement("br"));
        else block.textContent = line;
        editor.appendChild(block);
      }
      if (editor.childNodes.length === 0) editor.innerHTML = emptyBlockMarkup(placeholder);
      syncEditor();
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    [placeholder, syncEditor],
  );

  // 事件桥：宿主（排队消息行的「编辑」动作）无法直接访问本组件的 state，
  // 统一走 `codex:composer-set-text` 自定义事件把文本送进来。
  useEffect(() => {
    const onSetText = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: unknown }>).detail;
      if (typeof detail?.text === "string") setEditorText(detail.text);
    };
    window.addEventListener("codex:composer-set-text", onSetText);
    return () => window.removeEventListener("codex:composer-set-text", onSetText);
  }, [setEditorText]);

  // 挂载即写入官方空态 DOM（不是 React children —— contenteditable 的内容由浏览器/本组件命令式管理，
  // 这正是官方 ProseMirror 的做法：React 一旦接管 children，每次输入都会把光标打回开头）
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.childNodes.length > 0) return;
    editor.innerHTML = emptyBlockMarkup(placeholder);
  }, [placeholder]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const text = readEditorValue(editorRef.current);
    if (disabled || (streaming && !steerable) || !hasComposerContent(text, attachmentCount)) return;
    onSend(text);
    resetEditor();
  };

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn("cx-composer", className)}
      data-disabled={disabled ? "true" : undefined}
      data-status={status}
    >
      <div className="cx-composer__attachments" data-empty={selection.attachments?.length ? undefined : ""}>
        {(selection.attachments ?? []).map((file) => (
          <span className="cx-attachment" key={file.id} title={file.name}>
            {file.previewUrl ? <img alt="" className="cx-attachment__thumb" src={file.previewUrl} /> : null}
            <span className="cx-attachment__name">{file.name}</span>
            <button
              aria-label={`移除附件 ${file.name}`}
              className="cx-attachment__remove"
              onClick={() => selection.onRemoveAttachment?.(file.id)}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {selection.notice ? (
        <p className="cx-composer__notice" role="status">
          {selection.notice}
        </p>
      ) : null}
      <div className="cx-composer__footer">
        <div className="cx-composer__input-row">
          <div className="cx-composer__input">
            {/*
              官方 [74] div.ProseMirror：role=textbox、aria-label = **占位符文案**。
              内容由本组件命令式维护（见上面的 useEffect），所以这里**不渲染任何 React children**。
            */}
            {/* 属性逐条对官方 EditorView attributes（app-initial-25361a10f2bf.js:187098）：
                role=textbox / aria-multiline=true / dir=auto / spellcheck=true / tabindex=0；
                aria-label = 占位符文案（blocks-chat-home block[74] 实测）。 */}
            {/* biome-ignore lint/a11y/useSemanticElements: contenteditable mirrors the official ProseMirror editor DOM. */}
            <div
              aria-label={placeholder}
              aria-disabled={disabled || undefined}
              aria-multiline="true"
              className="cx-composer__editor"
              contentEditable={!disabled}
              dir="auto"
              onInput={syncEditor}
              onKeyDown={(event) => {
                if (disabled) return;
                if (
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229 ||
                  event.key === "Process"
                ) {
                  return;
                }
                if (event.key !== "Enter") return;
                if (event.shiftKey) {
                  event.preventDefault();
                  insertSoftBreak();
                  syncEditor();
                  return;
                }
                /*
                 * 「发送快捷键」设置（设置 → 常规 → 发送快捷键，store.enterBehavior）：
                 *   enter           → Enter 发送、Ctrl/Cmd+Enter 换行（默认，官方原行为）
                 *   modifier-enter  → Ctrl/Cmd+Enter 发送、Enter 换行
                 * 与官方一致：竖线（`|` 的兄弟键）之外的修饰键不参与判定；Shift+Enter 恒为软换行。
                 */
                const submitWithModifier = enterBehavior === "modifier-enter";
                const hasModifier = event.ctrlKey || event.metaKey;
                if (submitWithModifier && !hasModifier) {
                  event.preventDefault();
                  insertSoftBreak();
                  syncEditor();
                  return;
                }
                if (!submitWithModifier && hasModifier) {
                  event.preventDefault();
                  insertSoftBreak();
                  syncEditor();
                  return;
                }
                event.preventDefault();
                submit();
              }}
              onPaste={(event) => {
                if (disabled) return;
                event.preventDefault();
                const text = event.clipboardData.getData("text/plain");
                if (text) insertPlainText(text);
                syncEditor();
              }}
              ref={editorRef}
              role="textbox"
              spellCheck
              suppressContentEditableWarning
              tabIndex={0}
            />
          </div>
        </div>

        <div className="cx-composer__group cx-composer__group--start">
          <input
            className="cx-composer__file-input"
            disabled={disabled}
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) selection.onAddFiles?.(files);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            aria-label="添加文件等内容"
            className="cx-composer__icon-button"
            disabled={disabled || !selection.onAddFiles}
            onClick={() => fileInputRef.current?.click()}
            title={selection.onAddFiles ? "添加图片或文件（图片会由模型直接读取）" : undefined}
            type="button"
          >
            <CodexPlusLg size={20} />
          </button>
          {/* 审批由服务端拦截策略控制，这里只展示事实状态。 */}
          <PermissionMenuChip />
        </div>

        <div className="cx-composer__group cx-composer__group--end">
          {/* 模型芯片 + 模型选择器弹层（audit #123 #124）+ effort 视口（#125） */}
          <ModelPickerChip
            effort={selection.effort}
            efforts={selection.efforts}
            locked={!selection.models?.length}
            modelLocked={selection.modelLocked || disabled}
            modelLockedReason={disabled ? "历史任务会话为只读" : selection.modelLockedReason}
            maxEffort={selection.maxEffort}
            model={selection.model}
            models={selection.models}
            onSelectEffort={selection.setEffort}
            onSelectModel={selection.setModelId}
            saving={selection.savingModel}
          />
          <div className="cx-composer__send-slot">
            <button
              aria-label={sendLabel}
              className="cx-composer__send"
              disabled={disabled || (showStop ? false : !canSend)}
              onClick={() => {
                if (disabled) return;
                if (showStop) onStop();
                else submit();
              }}
              type="button"
            >
              {showStop ? <CodexStop size={16} /> : <CodexSend size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/*
        ⚠️ 这里**曾经**挂过展开钮（audit #50）：aria-label 展开/折叠、aria-pressed、
           data-composer-expand-toggle、展开时 data-expanded-composer，外层 absolute end-2.5 top-2.5。
        本轮官方端实机采集判定它**不存在于 Focus 线程**（见文件头「为什么这里没有展开钮」：
        557 字符 / 39 行草稿下两个选择器 found:false、全页 Expand/Collapse 候选 0 个），
        故整块已移除 —— **不要**再按 audit #50 把它加回来。
        那批官方搬运 CSS 仍留在 chat.css（RULINGS R13 不删），但当前不可达。
      */}
    </div>
  );
}
