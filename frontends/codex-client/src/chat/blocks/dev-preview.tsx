import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ThemeProvider } from "@/app/theme-provider";
import { AppShell } from "@/shell";
import "@/styles/index.css";

import { ActivityBlock, ActivityGroup } from "./ActivityBlock";
import { FIXTURES } from "./fixtures";
import type { BlockNode } from "./types";

/**
 * 仅开发用的**会话块自测台**（形态对齐 src/pages/dev-preview.html 的既有做法）。
 *
 * 为什么放在本目录：task-13 的写范围是 src/chat/blocks/**，不改别人的文件。
 * 用 MemoryRouter 把页面挂进**真实外壳**（@/shell 的 AppShell 是公开 barrel 导出），
 * 这样截图就是实机画面 —— 顶部菜单栏 / 导轨 / 侧栏面板都是别人的真实实现。
 *
 * 打开方式（先 npm run dev，vite 在 127.0.0.1:5273）：
 *   http://127.0.0.1:5273/src/chat/blocks/dev-preview.html
 *
 * 布局刻意复刻会话列：768px 列宽 + 16px 内边距（出处见 src/chat/ChatConversation.tsx
 * 顶部实测注释：转录列 768、padding 0 16px 32px、消息 gap 12px）。
 */

/** 分组演示：item 档（16px）/ grouped 档（4px） */
function GroupedDemo() {
  const grouped: BlockNode[] = [
    { code: "const a = 1;", id: "g-code-1", kind: "code", language: "ts" },
    { code: "const b = 2;", id: "g-code-2", kind: "code", language: "ts" },
  ];
  return <ActivityGroup blocks={grouped} spacing="grouped" />;
}

function BlocksPreviewPage() {
  const [first, ...rest] = FIXTURES;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
      <div
        className="cx-preview-scroll"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: "32px 0 0",
        }}
      >
        <div
          className="cx-preview-col"
          style={{
            width: 768,
            margin: "0 auto",
            padding: "0 16px 32px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ fontSize: 14, fontWeight: 590, margin: "0 0 4px" }}>
              会话块自测台 · ActivityBlock / ActivityGroup
            </h1>
            <ActivityBlock block={first} />
            <ActivityGroup blocks={rest} spacing="item" />
            <GroupedDemo />
          </div>
        </div>
      </div>
    </div>
  );
}

document.documentElement.lang = "zh-CN";

const container = document.getElementById("root");
if (!container) throw new Error("dev-preview.html 缺少 #root 容器");

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={["/blocks"]}>
        <Routes>
          <Route element={<AppShell />} path="/">
            <Route element={<BlocksPreviewPage />} path="blocks" />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
);
