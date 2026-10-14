// ARTEX 桌面端 preload —— 渲染进程与主进程之间**唯一**的通道。
//
// 只做一件事：把 `window.codexDesktop.invoke(action, payload)` 暴露给页面，
// 由主进程的 `codex-desktop:invoke` 处理器按白名单分发（见 main.js 的同名 handler）。
// 之所以需要它：渲染进程是 `contextIsolation: true` + `nodeIntegration: false`，
// 没有它页面就拿不到任何原生能力（例如「选择文件…」对话框）。
// 约定出处：src/shell/desktop-bridge.ts 的 IPC 通道说明。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexDesktop", {
  invoke: (action, payload) => ipcRenderer.invoke("codex-desktop:invoke", action, payload),
});
