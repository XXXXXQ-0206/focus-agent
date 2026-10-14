#!/usr/bin/env node
/**
 * ARTEX · 一次连接完成「跑验证 + 截图」的 CDP 小工具（自定义 API 运行时专用）
 * ==========================================================================
 * 为什么要自己写：
 *   本工程的 src/** 有多个作业组在同时改，Vite 开发服务器会因此整页热重载，
 *   把验证脚本画出来的 DOM 覆盖层冲掉 —— 结果截出来是白屏（已实测）。
 *   所以这里：
 *     1. Page.addScriptToEvaluateOnNewDocument 注入一个「结论自恢复」渲染器
 *        （读 sessionStorage 里的结论，重载后重新画出来，8 秒内持续补齐）；
 *     2. 在**同一条 WebSocket** 上先跑表达式、紧接着 Page.captureScreenshot，
 *        把「跑完到截图」的窗口压到毫秒级。
 *
 * 用法：node src/api/dev-verify-shot.mjs <cdpPort> <exprFile> <out.png>
 * 退出码：0 = 表达式跑完并截图成功；2 = 环境/协议失败
 */
import fs from "node:fs";
import http from "node:http";

const [port, exprFile, out] = process.argv.slice(2);
if (!port || !exprFile || !out) {
  console.error("usage: node src/api/dev-verify-shot.mjs <cdpPort> <exprFile> <out.png>");
  process.exit(2);
}

/** 重载后自恢复的结论覆盖层（在文档开始时注入） */
const RESTORE_OVERLAY = `(() => {
  const render = () => {
    if (document.getElementById("api-dev-verify")) return;
    const raw = window.sessionStorage && window.sessionStorage.getItem("api-dev-verify-report");
    if (!raw || !document.body) return;
    let report = null;
    try { report = JSON.parse(raw); } catch { return; }
    const host = document.createElement("div");
    host.id = "api-dev-verify";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0b0d10;color:#e8e8e8;font:12.5px/1.75 ui-monospace,Consolas,monospace;padding:26px 30px;overflow:auto;white-space:pre-wrap";
    host.textContent = report.text;
    document.body.appendChild(host);
  };
  render();
  const timer = setInterval(render, 200);
  setTimeout(() => clearInterval(timer), 15000);
})();`;

const getJson = (path) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: Number(port), path, agent: false }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });

const targets = await getJson("/json/list");
const page = targets.find((target) => target.type === "page");
if (!page) {
  console.error(`no page target on port ${port}`);
  process.exit(2);
}

const expression = fs.readFileSync(exprFile, "utf8");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, { resolve, reject });
    ws.send(JSON.stringify({ id: current, method, params }));
  });

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("ws error"));
});
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  }
};

await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: RESTORE_OVERLAY });

let failed = false;
try {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    failed = true;
    console.error(`EXCEPTION: ${JSON.stringify(result.exceptionDetails).slice(0, 1500)}`);
  } else {
    console.log(JSON.stringify(result.result.value, null, 1));
  }
} catch (error) {
  failed = true;
  console.error(`evaluate failed: ${error.message}`);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`screenshot saved: ${out} (${shot.data.length} base64 chars)`);
ws.close();
process.exit(failed ? 1 : 0);
