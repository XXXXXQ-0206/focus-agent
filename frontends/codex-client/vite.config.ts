import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Focus renderer 沿用 Vite 8（Rolldown）构建链。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    // Do not silently move to another port when another Vite process is
    // running. A fallback port would create a second HMR graph and make the UI
    // appear to flash or reload indefinitely.
    strictPort: true,
    proxy: {
      "/api": {
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
