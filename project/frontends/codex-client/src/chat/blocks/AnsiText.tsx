import { type CSSProperties, Fragment, useMemo } from "react";

/**
 * 终端 ANSI 输出渲染（SPEC §5，**包内确证**）
 * ============================================================================
 * 官方来源：ansi-block-80870a2203ab.js（DOM 字面量）+ ansi-block-cecb2c03ae9a.css（16 色全）
 *
 *   code[class=<className>]
 *   └─ span[class="<fg>-fg <bg>-bg ansi-bold ansi-italic …"][style={…}]
 *          [data-ansi-truecolor-fg][data-ansi-truecolor-bg][data-ansi-is-inverted]
 *
 * 颜色类名族、装饰类名、真彩 data-* 全部按 SPEC §5.1 输出；CSS 在 blocks.css（§5.2 的 16 色 + token 桥）。
 *
 * ⚠️ 未实测项（SPEC §13.9）：色板与类名机制确证，但**未在真实彩色终端输出上实测**。
 * ✅ [task-70] 256 色**不再是推断**：官方 ansi-block JS 的 `setupPalette()` 给出了完整算法
 *    （16 基础 187/85/255 档 + cube [0,95,135,175,215,255] + 24 级灰阶），本文件已按它改正并对齐，
 *    出处见 PALETTE_BASE / palette256 上方注释（官方产物 ansi-block-80870a2203ab.js）。
 * ⚠️ 推断项：SPEC §5.1 提到「\r 复写（进度条）由前置函数处理（clearLine）」但没有源码，
 *    本文件用 normalizeCarriageReturns 做等价覆盖，行为为推断实现。
 *
 * 实现说明：解析器**不用正则匹配 ESC**（本仓库 biome 禁止正则里的控制字符），
 * 改为逐字符扫描 + readEscapeSequence 手工跳转，等价且更直白。
 */

/** SPEC §5.2：.ansi-{color}-fg|bg 与 .ansi-bright-*-fg|bg 的色名序列 */
const COLOR_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
const ESC = 27; // U+001B
const BEL = 7; // U+0007

/** ✅ [task-70] **已证**：官方内联调色板的前 16 项 = `187/85/255` 那一组（0xBB 档），
 *  **不是** xterm.js 默认的 205 档（我们原先写的 #cd0000/#0000ee/#e5e5e5/#7f7f7f 全部作废）。
 *  出处：官方产物 `app/webview/assets/ansi-block-80870a2203ab.js` 的 `setupPalette()` ——
 *  `[[{color:`0, 0, 0`,class:`ansi-black`},{color:`187, 0, 0`,class:`ansi-red`}…],
 *    [{color:`85, 85, 85`,class:`ansi-bright-black`},…]]`（后接 cube `[0,95,135,175,215,255]` 与 24 级灰阶）。
 *  注：官方**类名路径**（`ansi-red` 等）走 CSS 变量 `--color-codex-terminal-ansi-*`（本仓见 blocks.css:470-516，
 *  token 优先 + 官方 hex 回退）；这张表只服务 `38;5;N` 的**内联回退**（apply256），两条路并存。 */
const PALETTE_BASE = [
  "#000000", // 0,0,0
  "#bb0000", // 187,0,0
  "#00bb00", // 0,187,0
  "#bbbb00", // 187,187,0
  "#0000bb", // 0,0,187
  "#bb00bb", // 187,0,187
  "#00bbbb", // 0,187,187
  "#ffffff", // 255,255,255（官方第 7 项即纯白；xterm 的 #e5e5e5 作废）
  "#555555", // 85,85,85
  "#ff5555", // 255,85,85
  "#00ff00", // 0,255,0
  "#ffff55", // 255,255,85
  "#5555ff", // 85,85,255
  "#ff55ff", // 255,85,255
  "#55ffff", // 85,255,255
  "#ffffff", // 255,255,255
];

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** ✅ [task-70] **已证**：与官方 `setupPalette()` 同式 —— cube = `[0,95,135,175,215,255]`、灰阶 = 8 + 10·n（24 级），
 *  16 基础项见上（官方 187/85/255 档）。出处同 PALETTE_BASE 上方引用的 ansi-block-80870a2203ab.js。 */
function palette256(index: number): string | undefined {
  if (index < 0 || index > 255) return undefined;
  if (index < 16) return PALETTE_BASE[index];
  if (index < 232) {
    const i = index - 16;
    const steps = [Math.floor(i / 36), Math.floor((i % 36) / 6), i % 6];
    return `#${steps.map((s) => hex2(s === 0 ? 0 : 55 + s * 40)).join("")}`;
  }
  const v = 8 + (index - 232) * 10;
  return `#${hex2(v)}${hex2(v)}${hex2(v)}`;
}

export interface AnsiSpan {
  text: string;
  /** SPEC §5.1 的类名族 + 装饰类名（ansi-bold / ansi-italic …） */
  classes: string[];
  style?: CSSProperties;
  /** SPEC §5.1：data-ansi-truecolor-fg|bg="r, g, b" */
  truecolorFg?: string;
  truecolorBg?: string;
  /** SPEC §5.1：data-ansi-is-inverted */
  inverted?: boolean;
}

interface EscapeInfo {
  length: number;
  /** SGR（ESC [ … m）时的参数数组；其它转义序列为 undefined */
  sgr?: number[];
}

/** 手工读取一个转义序列（不依赖正则，避开控制字符正则限制） */
function readEscapeSequence(input: string, start: number): EscapeInfo {
  let i = start + 1;
  if (i >= input.length) return { length: 1 };
  const kind = input[i];
  if (kind === "[") {
    i += 1;
    const paramsStart = i;
    while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ";")) i += 1;
    while (i < input.length && input[i] >= " " && input[i] <= "/") i += 1;
    if (i >= input.length) return { length: input.length - start };
    const final = input[i];
    const length = i - start + 1;
    if (final === "m") {
      const raw = input.slice(paramsStart, i);
      return { length, sgr: (raw === "" ? "0" : raw).split(";").map((p) => Number(p) || 0) };
    }
    return { length };
  }
  if (kind === "]") {
    // OSC：直到 BEL 或 ST（ESC + 反斜杠）
    i += 1;
    while (i < input.length && input.charCodeAt(i) !== BEL && input.charCodeAt(i) !== ESC) i += 1;
    if (i >= input.length) return { length: input.length - start };
    if (input.charCodeAt(i) === ESC && input[i + 1] === "\\") return { length: i - start + 2 };
    return { length: i - start + 1 };
  }
  // 其它（字符集选择等）：吃两字符
  return { length: 2 };
}

interface SgrState {
  classes: Set<string>;
  style: CSSProperties;
  truecolorFg?: string;
  truecolorBg?: string;
  inverted?: boolean;
}

const newState = (): SgrState => ({ classes: new Set<string>(), style: {} });

function reset(state: SgrState) {
  state.classes.clear();
  state.style = {};
  state.truecolorFg = undefined;
  state.truecolorBg = undefined;
  state.inverted = undefined;
}

function clearColorClasses(state: SgrState, isFg: boolean) {
  for (const name of [...state.classes]) {
    if (isFg && name.endsWith("-fg")) state.classes.delete(name);
    if (!isFg && name.endsWith("-bg")) state.classes.delete(name);
    if (name.startsWith("ansi-palette-")) state.classes.delete(name);
  }
}

function setFg(state: SgrState, name: string) {
  clearColorClasses(state, true);
  state.classes.add(`ansi-${name}-fg`);
  state.truecolorFg = undefined;
  delete state.style.color;
}

function setBg(state: SgrState, name: string) {
  clearColorClasses(state, false);
  state.classes.add(`ansi-${name}-bg`);
  state.truecolorBg = undefined;
  delete state.style.backgroundColor;
}

function apply256(state: SgrState, isFg: boolean, index: number) {
  const color = palette256(index);
  if (!color) return;
  clearColorClasses(state, isFg);
  state.classes.add(`ansi-palette-${index}`);
  if (isFg) {
    state.truecolorFg = undefined;
    state.style.color = color;
  } else {
    state.truecolorBg = undefined;
    state.style.backgroundColor = color;
  }
}

function applyTruecolor(state: SgrState, isFg: boolean, r: number, g: number, b: number) {
  const triplet = `${r}, ${g}, ${b}`;
  clearColorClasses(state, isFg);
  state.classes.add("ansi-truecolor");
  if (isFg) {
    state.truecolorFg = triplet;
    state.style.color = `rgb(${triplet})`;
  } else {
    state.truecolorBg = triplet;
    state.style.backgroundColor = `rgb(${triplet})`;
  }
}

/**
 * SGR 参数应用。支持：0/1/2/3/4/5/7/8/9 + 22/23/24/25/27/28/29、
 * 30–37 / 90–97 / 40–47 / 100–107、38;5;n / 48;5;n、38;2;r;g;b / 48;2;r;g;b。
 * SPEC §5.1 的装饰回退（bold→font-weight / dim→opacity / italic / hidden / underline / strikethrough）也在此落地。
 */
function applySgr(state: SgrState, params: number[]) {
  for (let i = 0; i < params.length; i += 1) {
    const code = params[i];
    if (code === 0) {
      reset(state);
    } else if (code === 1) {
      state.classes.add("ansi-bold");
    } else if (code === 2) {
      state.classes.add("ansi-dim");
    } else if (code === 3) {
      state.classes.add("ansi-italic");
    } else if (code === 4) {
      state.classes.add("ansi-underline");
    } else if (code === 5) {
      state.classes.add("ansi-blink");
    } else if (code === 7) {
      state.classes.add("ansi-reverse");
      state.inverted = true;
    } else if (code === 8) {
      state.classes.add("ansi-hidden");
    } else if (code === 9) {
      state.classes.add("ansi-strikethrough");
    } else if (code === 22) {
      state.classes.delete("ansi-bold");
      state.classes.delete("ansi-dim");
    } else if (code === 23) {
      state.classes.delete("ansi-italic");
    } else if (code === 24) {
      state.classes.delete("ansi-underline");
    } else if (code === 25) {
      state.classes.delete("ansi-blink");
    } else if (code === 27) {
      state.classes.delete("ansi-reverse");
      state.inverted = undefined;
    } else if (code === 28) {
      state.classes.delete("ansi-hidden");
    } else if (code === 29) {
      state.classes.delete("ansi-strikethrough");
    } else if (code >= 30 && code <= 37) {
      setFg(state, COLOR_NAMES[code - 30]);
    } else if (code >= 90 && code <= 97) {
      setFg(state, `bright-${COLOR_NAMES[code - 90]}`);
    } else if (code >= 40 && code <= 47) {
      setBg(state, COLOR_NAMES[code - 40]);
    } else if (code >= 100 && code <= 107) {
      setBg(state, `bright-${COLOR_NAMES[code - 100]}`);
    } else if (code === 38 || code === 48) {
      const isFg = code === 38;
      const mode = params[i + 1];
      if (mode === 5) {
        apply256(state, isFg, params[i + 2] ?? 0);
        i += 2;
      } else if (mode === 2) {
        applyTruecolor(state, isFg, params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0);
        i += 4;
      }
    }
    // 未知 SGR 参数：忽略（SPEC 未给其它参数的处理）
  }
}

/**
 * 推断实现（SPEC 未给源码）：\r 复写。
 * 逐字符扫描，转义序列记为零宽；\r 把写入列复位到行首，后续字符覆盖已有内容。
 */
export function normalizeCarriageReturns(input: string): string {
  const out: string[] = [];
  let chars: string[] = [];
  let escapes: string[][] = [];
  let column = 0;

  const flushLine = () => {
    let line = "";
    for (let i = 0; i < chars.length; i += 1) {
      if (escapes[i]) line += escapes[i].join("");
      line += chars[i] ?? "";
    }
    if (escapes[chars.length]) line += escapes[chars.length].join("");
    return line;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (input.charCodeAt(i) === ESC) {
      const info = readEscapeSequence(input, i);
      const seq = input.slice(i, i + info.length);
      if (!escapes[column]) escapes[column] = [];
      escapes[column].push(seq);
      i += info.length - 1;
      continue;
    }
    if (ch === "\r") {
      column = 0;
      continue;
    }
    if (ch === "\n") {
      out.push(flushLine());
      out.push("\n");
      chars = [];
      escapes = [];
      column = 0;
      continue;
    }
    chars[column] = ch;
    column += 1;
  }
  out.push(flushLine());
  return out.join("");
}

/** 解析为可直接渲染的片段序列（相邻同态片段不合并，保持与官方「一段一个 span」一致） */
export function parseAnsi(input: string): AnsiSpan[] {
  const text = normalizeCarriageReturns(input);
  const spans: AnsiSpan[] = [];
  const state = newState();
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    spans.push({
      text: buffer,
      classes: [...state.classes],
      style: Object.keys(state.style).length ? { ...state.style } : undefined,
      truecolorFg: state.truecolorFg,
      truecolorBg: state.truecolorBg,
      inverted: state.inverted,
    });
    buffer = "";
  };

  for (let i = 0; i < text.length; ) {
    if (text.charCodeAt(i) === ESC) {
      const info = readEscapeSequence(text, i);
      if (info.length > 1) {
        if (info.sgr) {
          flush();
          applySgr(state, info.sgr);
        }
        i += info.length;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flush();
  return spans;
}

/** SPEC §5.1 的渲染形态：外层 code，每段包一个带类名 / data-* 的 span；无样式段直接输出文本 */
export function AnsiText({ text, className }: { text: string; className?: string }) {
  const spans = useMemo(() => parseAnsi(text), [text]);
  return (
    <code className={className}>
      {spans.map((span, index) => {
        if (!span.classes.length && !span.style) return <Fragment key={index}>{span.text}</Fragment>;
        return (
          <span
            className={span.classes.join(" ")}
            data-ansi-is-inverted={span.inverted ? "true" : undefined}
            data-ansi-truecolor-bg={span.truecolorBg}
            data-ansi-truecolor-fg={span.truecolorFg}
            key={index}
            style={span.style}
          >
            {span.text}
          </span>
        );
      })}
    </code>
  );
}
