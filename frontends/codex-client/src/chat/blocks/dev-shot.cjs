/**
 * 会话块自测台的**一次性** Electron 启动器（仅开发用，task-13 自证截图用）。
 *
 * 为什么需要它：
 *   共享的"真机"实例加载的是 app://-/index.html（dist 产物），而本目录的自测台是
 *   **vite dev server 的独立 HTML 入口**（dev-preview.html），走不进 app:// 协议。
 *   为了不打扰别人的实例，这里起一个**自己的、可随时关掉的**窗口，
 *   直接加载 dev server 的 URL，再用 tools/cdp-shot.mjs / cdp-eval.mjs 截图与量算。
 *
 * 用法：
 *   npx electron src/chat/blocks/dev-shot.cjs --remote-debugging-port=9800 --user-data-dir=C:\temp\codex-blocks-9800
 *   node tools/cdp-shot.mjs 9800 <out.png>
 *   node tools/cdp-eval.mjs 9800 "<表达式文件>"     # 量算 computed style，核对 SPEC 数值
 *
 * 注：用 .cjs —— 本仓库 package.json 是 "type": "module"，而 Electron 42 的 ESM 入口
 *     不提供 electron 的命名导出（named export 报错），CJS 的 require 最稳。
 */
const { app, BrowserWindow } = require("electron");

const DEFAULT_URL = "http://127.0.0.1:5273/src/chat/blocks/dev-preview.html";
const url = process.argv.find((arg) => arg.startsWith("http")) ?? DEFAULT_URL;

// dpr 保持 1：自测台用于核对"块长什么样"，1:1 像素更好读。
// 官方参考端实测是 dpr 1.5（SPEC §0），所以数值核对一律走 cdp-eval 的 computed style。
app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    backgroundColor: "#282828",
    height: 816,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    width: 1280,
  });
  await win.loadURL(url);
  win.setTitle("会话块自测台 (task-13)");
  console.log(`dev-shot: loaded ${url}`);
});

app.on("window-all-closed", () => app.quit());
