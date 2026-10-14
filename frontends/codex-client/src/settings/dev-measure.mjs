#!/usr/bin/env node
/**
 * 设置页 / 基础件几何自测脚本（零依赖 CDP 客户端）。
 *
 * 用法（先起 dev server 与一个带远程调试的 Chromium）：
 *   npm run dev
 *   msedge --headless=new --remote-debugging-port=9333 --window-size=1280,816 about:blank
 *   node src/settings/dev-measure.mjs --port 9333 --url http://127.0.0.1:5273/src/settings/dev-preview.html
 *
 * 做什么：
 *   1) Emulation.setDeviceMetricsOverride 定尺 1280x816（SPEC §1 参考端视口）
 *   2) 打开自测台，量设置页 + 侧栏导航 + 基础件的几何与 computed style
 *   3) 真实点击打开 dialog / menu / popover，真实 hover 出 tooltip，再量弹层
 *   4) 键盘可达性：对话框内 Tab 焦点锁、Esc 关闭、焦点归还触发元素
 *
 * 输出：一段 JSON（stdout），可直接贴进验收报告。
 */

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(arg("port", "9333"));
const BASE = arg("url", "http://127.0.0.1:5273/src/settings/dev-preview.html");
const SECTION = arg("section", "shortcuts");
const WIDTH = Number(arg("width", "1280"));
const HEIGHT = Number(arg("height", "816"));
const OUT = arg("out", "");

import { writeFileSync } from "node:fs";

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools://"));
if (!target) throw new Error(`没有可用的 page target（端口 ${PORT}）`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let seq = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails)
    throw new Error(`eval 失败: ${JSON.stringify(result.exceptionDetails.exception)}`);
  return result.result.value;
}

async function bootstrap(url) {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const ready = await evaluate(
      "document.readyState === 'complete' && !!document.querySelector('.cx-settings-card')",
    );
    if (ready) break;
  }
  await sleep(700);
}

async function pointOf(selector) {
  const point = await evaluate(
    "(() => { const el = document.querySelector(" +
      JSON.stringify(selector) +
      "); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()",
  );
  // 元素不存在时返回 null：真实外壳里没有实验室，量测脚本要能降级跳过
  return point;
}

async function clickSelector(selector) {
  const point = await pointOf(selector);
  if (!point) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
  }
  return true;
}

async function hoverSelector(selector) {
  const point = await pointOf(selector);
  if (!point) return false;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, buttons: 0 });
  return true;
}

const KEYS = {
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
};

async function pressKey(name) {
  const spec = KEYS[name];
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...spec });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...spec });
  await sleep(200);
}

const STYLE_PROPS = [
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "border-radius",
  "padding",
  "margin",
  "min-height",
  "max-width",
  "min-width",
  "box-shadow",
  "border-width",
  "backdrop-filter",
  "corner-shape",
  "gap",
  "z-index",
];

/** 返回一段可注入页面的量测表达式：给定 selector 表与属性表，输出 rect + computed style */
function measureExpression(selectors) {
  return (
    "(() => {" +
    "const selectors = " +
    JSON.stringify(selectors) +
    ";" +
    "const props = " +
    JSON.stringify(STYLE_PROPS) +
    ";" +
    "const out = {};" +
    "for (const key of Object.keys(selectors)) {" +
    "  const el = document.querySelector(selectors[key]);" +
    "  if (!el) { out[key] = null; continue; }" +
    "  const r = el.getBoundingClientRect();" +
    "  const cs = getComputedStyle(el);" +
    "  const style = {};" +
    "  for (const p of props) style[p] = cs.getPropertyValue(p);" +
    '  out[key] = { rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }, style, text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60) };' +
    "}" +
    "return out;" +
    "})()"
  );
}

const report = {
  viewport: null,
  settings: null,
  nav: null,
  kbd: null,
  controls: null,
  dialog: null,
  keyboard: null,
  menu: null,
  tooltip: null,
  popover: null,
};

await bootstrap(`${BASE}?section=${SECTION}`);

report.viewport = await evaluate(
  "({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, theme: document.documentElement.dataset.theme, reducedMotion: document.documentElement.dataset.reducedMotion })",
);

report.settings = await evaluate(
  "(() => {" +
    'const scroll = document.querySelector(".cx-settings__scroll");' +
    'const column = document.querySelector(".cx-settings__column");' +
    'const title = document.querySelector(".cx-settings__title");' +
    'const card = document.querySelector(".cx-settings-card");' +
    'const rows = [...document.querySelectorAll(".cx-settings-card .cx-settings-row")];' +
    'const label = document.querySelector(".cx-settings-row__label");' +
    'const desc = document.querySelector(".cx-settings-row__description");' +
    "const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };" +
    "const st = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = s.getPropertyValue(p); return o; };" +
    "return {" +
    "  scroll: scroll ? { rect: box(scroll), clientWidth: scroll.clientWidth, offsetWidth: scroll.offsetWidth, clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight } : null, " +
    "  column: column ? { rect: box(column), maxWidth: getComputedStyle(column).maxWidth } : null, " +
    '  title: { rect: box(title), style: st(title, ["font-size","font-weight","line-height","color"]) }, ' +
    '  card: { rect: box(card), style: st(card, ["background-color","border-radius","padding","border-width","box-shadow","corner-shape"]) }, ' +
    "  rowHeights: [...new Set(rows.map((r) => +r.getBoundingClientRect().height.toFixed(2)))], " +
    "  rowMinHeight: rows.length ? getComputedStyle(rows[0]).minHeight : null, " +
    '  label: label ? st(label, ["font-size","font-weight","line-height","color"]) : null, ' +
    '  description: desc ? st(desc, ["font-size","font-weight","line-height","color"]) : null, ' +
    '  cardCount: document.querySelectorAll(".cx-settings-card").length' +
    "};" +
    "})()",
);

report.nav = await evaluate(
  "(() => {" +
    'const search = document.querySelector(".cx-settings-nav__search");' +
    'const items = [...document.querySelectorAll(".cx-settings-nav__item")];' +
    'const titles = [...document.querySelectorAll(".cx-settings-nav__group-title")];' +
    'const selected = document.querySelector(".cx-settings-nav__item[aria-current=page]");' +
    "const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };" +
    "const st = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = s.getPropertyValue(p); return o; };" +
    "return {" +
    "  present: !!search, " +
    '  search: search ? { rect: box(search), style: st(search, ["height","border-radius","background-color","padding"]) } : null, ' +
    '  first: { rect: box(items[0]), style: st(items[0], ["height","border-radius","font-size","font-weight","line-height","padding","color"]) }, ' +
    "  second: items[1] ? box(items[1]) : null, " +
    "  step: items[1] ? +(items[1].getBoundingClientRect().y - items[0].getBoundingClientRect().y).toFixed(2) : null, " +
    "  count: items.length, " +
    '  groupTitle: titles.length ? { text: titles[0].textContent, style: st(titles[0], ["font-size","font-weight","line-height"]) } : null, ' +
    "  selected: selected ? { text: selected.textContent, background: getComputedStyle(selected).backgroundColor } : null" +
    "};" +
    "})()",
);

// ── 稳定性两条断言（借 dsh-codex-ui 的验证方法论）──────────────────────────
//   1) 聚焦不改变整框几何：输入框聚焦前后 rect 必须完全一致
//   2) 稳定后不得继续写 DOM：静置 1s 内 MutationObserver 记录的变更数必须为 0
report.stability = await evaluate(
  "(async () => {" +
    'const search = document.querySelector(".cx-settings-nav__input, .cx-settings-nav__search input");' +
    'const wrap = document.querySelector(".cx-settings-nav__search");' +
    "if (!search || !wrap) return { skipped: '本页没有侧栏设置导航' };" +
    "const before = wrap.getBoundingClientRect();" +
    "search.focus();" +
    "await new Promise((r) => setTimeout(r, 120));" +
    "const after = wrap.getBoundingClientRect();" +
    "const geometryStable = before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height;" +
    "const activeBefore = document.activeElement === search;" +
    "let mutations = 0;" +
    "const observer = new MutationObserver((records) => { mutations += records.length; });" +
    "observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });" +
    "await new Promise((r) => setTimeout(r, 1000));" +
    "observer.disconnect();" +
    "search.blur();" +
    "return { focusGeometryStable: geometryStable, focusLanded: activeBefore, domMutationsIn1s: mutations };" +
    "})()",
);

report.kbd = await evaluate(measureExpression({ kbd: "#lab-kbd" }));
report.controls = await evaluate(
  "(() => {" +
    'const ids = { switch: "#lab-switch", checkbox: "#lab-checkbox", select: "#lab-select", slider: "#lab-slider", textarea: "#lab-textarea" };' +
    "const out = {};" +
    "for (const key of Object.keys(ids)) {" +
    "  const el = document.querySelector(ids[key]);" +
    "  if (!el) { out[key] = null; continue; }" +
    "  const r = el.getBoundingClientRect();" +
    "  const s = getComputedStyle(el);" +
    '  out[key] = { rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }, style: { "border-radius": s.borderRadius, "background-color": s.backgroundColor, "font-size": s.fontSize, "box-shadow": s.boxShadow.slice(0, 120) } };' +
    "}" +
    "return out;" +
    "})()",
);

// ── 弹层：真实点击 / 悬停 ────────────────────────────────────────────────────
await clickSelector("#lab-dialog-trigger");
await sleep(1000);
report.dialog = await evaluate(
  measureExpression({
    content: ".cx-dialog__content",
    overlay: ".cx-dialog__overlay",
    title: ".cx-dialog__title",
    footer: ".cx-dialog__footer",
  }),
);

report.keyboard = {};
report.keyboard.focusAfterOpen = await evaluate(
  "document.activeElement && (document.activeElement.id || document.activeElement.tagName)",
);
const tabTrace = [];
for (let i = 0; i < 4; i++) {
  await pressKey("Tab");
  tabTrace.push(
    await evaluate(
      '(() => { const el = document.activeElement; const dialog = document.querySelector(".cx-dialog__content"); return { id: el.id || null, tag: el.tagName, inDialog: !!(dialog && dialog.contains(el)) }; })()',
    ),
  );
}
report.keyboard.tabTrace = tabTrace;
await pressKey("Escape");
await sleep(600);
report.keyboard.escape = await evaluate(
  '(() => ({ dialogClosed: !document.querySelector(".cx-dialog__content"), overlayClosed: !document.querySelector(".cx-dialog__overlay"), focusReturnedTo: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }))()',
);

await clickSelector("#lab-menu-trigger");
await sleep(600);
report.menu = await evaluate(
  measureExpression({
    content: ".cx-menu__content",
    item: ".cx-menu__item",
    shortcut: ".cx-menu__shortcut",
    separator: ".cx-menu__separator",
  }),
);
report.menu.items = await evaluate(
  '[...document.querySelectorAll(".cx-menu__item")].map((el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; })',
);
await pressKey("Escape");
await sleep(400);
report.menu.focusAfterClose = await evaluate(
  "document.activeElement && (document.activeElement.id || document.activeElement.tagName)",
);

await hoverSelector("#lab-tooltip-trigger");
await sleep(1400);
report.tooltip = await evaluate(measureExpression({ content: ".cx-tooltip__content" }));

await clickSelector("#lab-popover-trigger");
await sleep(600);
report.popover = await evaluate(measureExpression({ content: ".cx-popover__content" }));
await pressKey("Escape");

// ── 设置项真实生效（主题 / 减少动效）─────────────────────────────────────────
//   走真实点击：外观分区的「浅色」单选 + 当前分区的「减少动效」开关
report.effects = await evaluate(
  "(async () => {" +
    "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));" +
    "const themeBefore = document.documentElement.dataset.theme;" +
    "const surfaceBefore = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();" +
    "const radio = [...document.querySelectorAll('[role=radio]')].find((el) => el.textContent.includes('浅色'));" +
    "if (radio) radio.click();" +
    "await sleep(400);" +
    "const themeAfter = document.documentElement.dataset.theme;" +
    "const surfaceAfter = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();" +
    "const switchEl = document.querySelector('[role=switch]');" +
    "const motionBefore = document.documentElement.dataset.reducedMotion;" +
    "if (switchEl) switchEl.click();" +
    "await sleep(300);" +
    "const motionAfter = document.documentElement.dataset.reducedMotion;" +
    "const persistedSettings = window.localStorage.getItem('codex.settings');" +
    "const persistedTheme = window.localStorage.getItem('codex.theme');" +
    "if (switchEl) switchEl.click();" +
    "await sleep(200);" +
    "const motionRestored = document.documentElement.dataset.reducedMotion;" +
    "const darkRadio = [...document.querySelectorAll('[role=radio]')].find((el) => el.textContent.includes('深色'));" +
    "if (darkRadio) darkRadio.click();" +
    "await sleep(300);" +
    "return { themeBefore, themeAfter, themeReallyChanged: themeBefore !== themeAfter, surfaceBefore, surfaceAfter, switchToggled: motionBefore !== motionAfter, motionBefore, motionAfter, motionRestored, themeRestored: document.documentElement.dataset.theme, persistedSettings, persistedTheme };" +
    "})()",
);

const text = JSON.stringify(report, null, 2);
if (OUT) {
  writeFileSync(OUT, text);
  console.log(`written ${OUT}`);
}
console.log(text);
ws.close();
