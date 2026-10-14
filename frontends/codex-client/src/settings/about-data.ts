/**
 * 「关于」分区用的版本信息。
 *
 * 出处：codex-desktop-electron/docs/BUILD-INFO.md（解包档案）
 *   · MSIX 包身份：OpenAI.Codex，Version 26.1002.7124.0，x64
 *   · app/package.json：name=openai-codex-electron，version=26.1002.52244，
 *     electron=42.3.0，Forge/maker-msix 7.11.2，Vite 8.2.0，
 *     codexBuildFlavor=prod，codexBuildNumber=13536
 *   · app/ChatGPT.exe FileVersion 155.0.8059.27（Chromium 155）
 *   · 源 MSIX SHA256 F2913FDF027A0924EF42198222E325AC8F6331580CBFFC51C7A8D18D8CE73C78
 *   · 运行时标记 app/resources/owl-electron-app.json：runtimeName=owl
 *
 * 右侧「还原工程」一列是本工程自己的构建链（package.json 0.1.0）。
 */

export interface AboutFact {
  key: string;
  value: string;
  mono?: boolean;
}

export const ABOUT_APP_FACTS: AboutFact[] = [
  { key: "应用版本", value: "26.1002.52244", mono: true },
  { key: "打包版本", value: "26.1002.7124.0 (x64)", mono: true },
  { key: "构建号", value: "13536 · prod", mono: true },
  { key: "Electron", value: "42.3.0", mono: true },
  { key: "Chromium", value: "155.0.8059.27", mono: true },
  { key: "运行时", value: "owl（Owl Electron App）" },
  { key: "界面语言", value: "简体中文（zh-CN）" },
];

export const ABOUT_BUILD_FACTS: AboutFact[] = [
  { key: "构建工具", value: "Vite 8.2.0 · Rolldown" },
  { key: "打包器", value: "Electron Forge 7.11.2 · maker-msix" },
  { key: "渲染层", value: "React 19 · Tailwind CSS v4 · Radix UI · sonner" },
  { key: "数据层", value: "TanStack Query · react-router" },
  { key: "源包 SHA256", value: "F2913FDF…8D8CE73C78", mono: true },
];

export const ABOUT_RESTORED_FACTS: AboutFact[] = [
  { key: "还原工程", value: "codex-desktop-src 0.1.0" },
  { key: "构建链", value: "Vite 8.3.4 · React 19 · TypeScript 5.9" },
  { key: "样式", value: "官方 token 原文 + 官方 CSS 资产搬运" },
  { key: "证据", value: "evidence/codex-desktop/SPEC.md（401 行实测规格）" },
];
