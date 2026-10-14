import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ThemeProvider } from "@/app/theme-provider";
import { AppShell } from "@/shell";
import "@/styles/index.css";

import { ExploreRoute } from "./ExplorePage";
import { PluginsRoute } from "./PluginsPage";
import { ReviewRoute } from "./ReviewPage";
import { ScheduledRoute } from "./ScheduledPage";

/**
 * 仅开发用的自测台：把四个页面挂进 **真实外壳**（@/shell 的 AppShell）。
 *
 * 之所以用 MemoryRouter 而不是改 src/shell/routes.tsx：
 * 路由装配是 Lead 的独占范围（ARCHITECTURE.md §3），本域只负责页面组件；
 * 这里用内存路由把页面放进真外壳，截图才等于实机画面，且不动别人的文件。
 * 装配完成后本文件可以删掉，不影响 src/pages/index.ts 的四个路由导出。
 */
const route = new URLSearchParams(window.location.search).get("route") ?? "scheduled";
const initialPath = ["scheduled", "plugins", "explore", "review"].includes(route)
  ? `/${route}`
  : "/scheduled";

document.documentElement.lang = "zh-CN";

const container = document.getElementById("root");
if (!container) throw new Error("dev-preview.html 缺少 #root 容器");

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppShell />} path="/">
            <Route element={<ScheduledRoute />} path="scheduled" />
            <Route element={<PluginsRoute />} path="plugins" />
            <Route element={<ExploreRoute />} path="explore" />
            <Route element={<ReviewRoute />} path="review" />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
);
