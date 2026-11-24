import { useCallback, useEffect, useRef, useState } from "react";

import "./inspect.css";

/**
 * 内置"检查器"（inspect overlay）。
 *
 * 用途：启用后**用鼠标就能定位任意组件**——
 *   · 悬停：蓝框标出元素边缘，标签里实时显示「React 组件名 · 标签.类名 · 宽×高 · x,y」；
 *   · 点击：红框固定选中项，右下角面板列出组件链、DOM 路径、尺寸、内边距、字号、背景、圆角；
 *   · Esc：退出检查模式（点击也恢复为正常交互）。
 *
 * 启用方式（三种任选）：
 *   1. 快捷键 Ctrl+Shift+X（再按一次关闭）；
 *   2. URL 追加 `?inspect=1`（桌面端/浏览器都行）；
 *   3. 控制台 `window.__inspect(true)`。
 *
 * 组件名从 React fiber 上读（React 18/19 会给 DOM 节点挂 `__reactFiber$*`），
 * 沿 fiber.return 往上找第一个函数/类组件；生产构建若被压缩，名字可能是短标识符，
 * 此时仍可用「标签.类名 + 设计稿类名（cx-*）」定位。
 */

interface Picked {
  el: Element;
  component: string | null;
  chain: string[];
  selector: string;
  rect: DOMRect;
  style: CSSStyleDeclaration;
}

function fiberKey(el: Element): string | undefined {
  return Object.keys(el).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
}

function componentNameOf(type: unknown): string | null {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (type && typeof type === "object") {
    const obj = type as { displayName?: string; name?: string };
    return obj.displayName || obj.name || null;
  }
  return null;
}

/** 沿 fiber 链收集组件名（最近的在前），最多 6 个。 */
function reactChain(el: Element): string[] {
  const key = fiberKey(el);
  if (!key) return [];
  const out: string[] = [];
  let fiber: any = (el as any)[key];
  let guard = 0;
  while (fiber && guard < 200) {
    const name = componentNameOf(fiber.type);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= 6) break;
    fiber = fiber.return;
    guard += 1;
  }
  return out;
}

function selectorOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let guard = 0;
  while (node && node !== document.body && guard < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id) part += `#${node.id}`;
    else {
      const cls = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    node = node.parentElement;
    guard += 1;
  }
  return parts.join(" > ");
}

function pick(el: Element): Picked {
  const chain = reactChain(el);
  /*
   * 面板标题取「第一个非 Radix 内部名」：Radix 会把 `Primitive.button` / `Primitive.div.Slot`
   * 这类名字放在链头，直接当标题（用户看到的"点了按钮显示 Primitive.button"）不如业务组件名有用；
   * 找不到别的名字时再退回链头。组件链一栏仍然给出**完整**（含 Primitive.*）的链。
   */
  const headline = chain.find((name) => !name.startsWith("Primitive")) ?? chain[0] ?? null;
  return {
    el,
    component: headline,
    chain,
    selector: selectorOf(el),
    rect: el.getBoundingClientRect(),
    style: getComputedStyle(el),
  };
}

const n = (value: number) => Math.round(value * 10) / 10;

export function InspectOverlay() {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState<Picked | null>(null);
  const [pinned, setPinned] = useState<Picked | null>(null);
  const [copied, setCopied] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const enable = useCallback((next: boolean) => {
    setActive(next);
    if (!next) {
      setHovered(null);
      setPinned(null);
    }
  }, []);

  // 启用方式：Ctrl+Shift+X / ?inspect=1 / window.__inspect
  useEffect(() => {
    document.documentElement.dataset.cxInspect = String(active);
  }, [active]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("inspect") === "1") setActive(true);
    (window as unknown as { __inspect?: (next?: boolean) => void }).__inspect = (next?: boolean) =>
      enable(next ?? !activeRef.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && (event.key === "X" || event.key === "x")) {
        event.preventDefault();
        enable(!activeRef.current);
        return;
      }
      if (event.key === "Escape" && activeRef.current) {
        enable(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      delete (window as unknown as { __inspect?: unknown }).__inspect;
    };
  }, [enable]);

  // 悬停 / 点击（捕获阶段拦下，避免触发页面本身的导航与按钮）
  useEffect(() => {
    if (!active) return;
    const onMove = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest(".cx-inspect")) return;
      setHovered(pick(target));
    };
    /**
     * 指针按下也要拦（2026-10-15 用户报告：「点原生按钮显示成了 html」）。
     *
     * 只拦 click 是不够的：Radix 的 Select / DropdownMenu（以及任何在 pointerdown 打开弹层的控件）
     * 会在 pointerdown 那一刻打开弹层，并把 <body> 设成 `pointer-events: none`（模态选择器的标准做法）。
     * 紧接着浏览器做 click 的命中测试时，body 里所有元素都被跳过 ⇒ `event.target` 变成
     * **`<html>`**，检查器于是"点了按钮、选中的是 html"（实测复现：按钮 box 1128,250 133×28，
     * click 的 target 是 HTML.dark，面板显示「html · 组件链（无 React fiber，纯 DOM）」）。
     * 在 pointerdown / mousedown 就 preventDefault，弹层不会打开、body 不会被关指针，
     * click 的 target 就仍是用户点的那颗按钮。
     */
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest(".cx-inspect")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".cx-inspect")) return;
      event.preventDefault();
      event.stopPropagation();
      if (!target) return;
      setPinned(pick(target));
      setCopied(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  if (!active) return null;

  const shown = pinned ?? hovered;
  const label = shown
    ? `${shown.component ?? shown.el.tagName.toLowerCase()} · ${shown.el.tagName.toLowerCase()}${shown.el.id ? `#${shown.el.id}` : ""} · ${n(shown.rect.width)}×${n(shown.rect.height)} · ${n(shown.rect.left)},${n(shown.rect.top)}`
    : "";

  return (
    <div className="cx-inspect" data-active="true">
      <div className="cx-inspect__hint">
        检查模式：悬停高亮 · 点击固定 · <kbd>Esc</kbd> 退出 · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>{" "}
        切换
      </div>

      {shown ? (
        <>
          <div
            className="cx-inspect__box"
            data-pinned={pinned ? "true" : undefined}
            style={{
              left: `${shown.rect.left}px`,
              top: `${shown.rect.top}px`,
              width: `${shown.rect.width}px`,
              height: `${shown.rect.height}px`,
            }}
          />
          <div
            className="cx-inspect__label"
            style={{
              left: `${Math.max(4, shown.rect.left)}px`,
              top: `${Math.max(4, shown.rect.top - 26)}px`,
            }}
          >
            {label}
          </div>
        </>
      ) : null}

      {pinned ? (
        <div className="cx-inspect__panel">
          <header className="cx-inspect__panel-head">
            <strong>{pinned.component ?? pinned.el.tagName.toLowerCase()}</strong>
            <button onClick={() => setPinned(null)} type="button">
              取消固定
            </button>
          </header>
          <dl className="cx-inspect__facts">
            <div>
              <dt>组件链</dt>
              <dd>{pinned.chain.length ? pinned.chain.join(" ← ") : "（无 React fiber，纯 DOM）"}</dd>
            </div>
            <div>
              <dt>选择器</dt>
              <dd>{pinned.selector}</dd>
            </div>
            <div>
              <dt>边框位置</dt>
              <dd>
                x {n(pinned.rect.left)} · y {n(pinned.rect.top)} · w {n(pinned.rect.width)} · h{" "}
                {n(pinned.rect.height)}
              </dd>
            </div>
            <div>
              <dt>内边距</dt>
              <dd>{pinned.style.padding}</dd>
            </div>
            <div>
              <dt>字号 / 行高</dt>
              <dd>
                {pinned.style.fontSize} / {pinned.style.lineHeight} · 字重 {pinned.style.fontWeight}
              </dd>
            </div>
            <div>
              <dt>背景 / 圆角</dt>
              <dd>
                {pinned.style.backgroundColor} · {pinned.style.borderRadius}
              </dd>
            </div>
            <div>
              <dt>间距 gap</dt>
              <dd>{pinned.style.gap}</dd>
            </div>
          </dl>
          <footer className="cx-inspect__panel-foot">
            <button
              onClick={() => {
                const text = [
                  `component: ${pinned.component ?? "(dom)"}`,
                  `chain: ${pinned.chain.join(" <- ")}`,
                  `selector: ${pinned.selector}`,
                  `rect: x=${n(pinned.rect.left)} y=${n(pinned.rect.top)} w=${n(pinned.rect.width)} h=${n(pinned.rect.height)}`,
                  `padding: ${pinned.style.padding}`,
                  `font: ${pinned.style.fontSize}/${pinned.style.lineHeight} ${pinned.style.fontWeight}`,
                  `background: ${pinned.style.backgroundColor} radius ${pinned.style.borderRadius}`,
                ].join("\n");
                void navigator.clipboard?.writeText(text).then(() => setCopied(true));
              }}
              type="button"
            >
              {copied ? "已复制" : "复制信息"}
            </button>
            <button onClick={() => enable(false)} type="button">
              退出检查
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
