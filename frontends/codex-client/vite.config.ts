import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Codex Desktop 渲染层原本是 Vite 8（Rolldown）构建的，这里保持同一代构建链。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    // Do not silently move to 3001/3002 when another Vite process is running.
    // The dual-frontend dev script reserves 3000 for this renderer and 3001
    // for the native ARTEX frontend; fallback ports make the browser connect
    // to a different HMR graph and appear to flash/reload indefinitely.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
      // Native ARTEX pages are mounted below /artex by the Go dual-UI host.
      // Proxying this prefix in dev keeps the Codex renderer's fallback route
      // on the same origin without feeding /artex/* back into Vite's SPA.
      "/artex": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // 原应用跑在 Chromium 155（Electron 42）；这里对齐到同一代语法基线。
    target: "chrome140",
    // 保留函数/类名：内置检查器（Ctrl+Shift+X）要显示 React 组件名，
    // 默认压缩会把 PaneRow / ApiSection 之类压成 Q / jL，定位就没意义了。
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
  },
});
