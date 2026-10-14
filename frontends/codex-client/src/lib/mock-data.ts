import type { Conversation, Message, ModelOption, PermissionMode, Project } from "./types";

/**
 * 演示数据。
 *
 * 这一层的存在是为了让 UI 在没有后端时也能完整呈现（列表 / 会话 / 流式态 / 工具调用）。
 * 接后端时替换本文件即可，组件不需要改。
 */

/**
 * 项目列表。
 *
 * ⚠️ 默认**留空**，这是刻意的：参考端那一屏「项目」分区显示的就是空态
 * （`60,168 272×41`、padding 8px、opacity .5、文案「没有项目」——见 docs/FIDELITY-AUDIT.md #19/#20/#21）。
 * 我们之前塞了 2 条假项目，导致项目分区从 71px 涨到 95px，**其后所有元素连锁下移 24px**，
 * 首页因此整体对不上参考端。
 *
 * 有项目时的渲染分支仍然完好（`SidebarPanel.tsx` 的 `PROJECTS.map(...)`），
 * 接后端拿到真实项目列表后自然就走那一条。想本地演示有项目的形态，
 * 把下面注释里的两条取消注释即可。
 */
export const PROJECTS: Project[] = [
  // { id: "p1", name: "codex-desktop-src", path: "C:/Users/you/Desktop/codex-desktop-src", pinned: true },
  // { id: "p2", name: "artex-web", path: "C:/Users/you/repos/artex-web" },
];

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "你好", updatedAt: minutesAgo(2), projectId: "p1", unread: true },
  { id: "c2", title: "把侧栏收起改成位移而不是压窄", updatedAt: minutesAgo(90), projectId: "p1" },
  {
    id: "c3",
    title: "还原顶部应用菜单的四张菜单",
    updatedAt: minutesAgo(400),
    projectId: "p2",
    running: true,
  },
  { id: "c4", title: "核对圆角倍率 1.25 与 superellipse", updatedAt: minutesAgo(1500), projectId: "p2" },
];

const ASSISTANT_GREETING = [
  "你好！我是这里的协作助手。",
  "",
  "你可以让我：",
  "",
  "- 分析这个仓库的结构",
  "- 还原某个界面区域的样式",
  "- 跑一次构建并报告结果",
  "",
  "需要我先做点什么？",
].join("\n");

const SIDEBAR_ANSWER = [
  "根因是折叠模式选错了。展开态与收起态之间应该只做位移，而不是压窄宽度：",
  "",
  "  折叠模式 = offcanvas   // 宽度恒定 288px，只做 translateX",
  "  折叠模式 = icon        // 宽度缩到 70px —— 里面没有 icon 态布局，内容会被挤成一团",
  "",
  "收起后位移到 x = -236，保留 52px 导轨；主内容内边距同步做 288 与 24 之间的过渡。",
].join("\n");

export const MESSAGES: Record<string, Message[]> = {
  c1: [
    { id: "m1", conversationId: "c1", role: "user", content: "你好", createdAt: minutesAgo(3) },
    {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      createdAt: minutesAgo(2),
      reasoning: "用户只是打了个招呼，直接回应即可，不需要调用工具。",
      content: ASSISTANT_GREETING,
      toolCalls: [
        {
          id: "t1",
          name: "read_file",
          summary: "读取 docs/ARCHITECTURE.md",
          status: "success",
          input: '{ "path": "docs/ARCHITECTURE.md" }',
          output: "# 工程架构与分工契约\n…",
        },
      ],
    },
  ],
  c2: [
    {
      id: "m3",
      conversationId: "c2",
      role: "user",
      content: "侧栏收起时内容被压成一团，怎么改？",
      createdAt: minutesAgo(95),
    },
    { id: "m4", conversationId: "c2", role: "assistant", createdAt: minutesAgo(90), content: SIDEBAR_ANSWER },
  ],
  c3: [],
  c4: [],
};

export const PERMISSION_MODES: PermissionMode[] = [
  { id: "ask", label: "请求批准" },
  { id: "auto-edit", label: "编辑外部文件和使用互联网时始终询问" },
  { id: "full", label: "完全访问", tone: "warning" },
];

export const MODELS: ModelOption[] = [
  // 参考端实测该芯片宽 107px，内容是「5.6 Sol」+ 右侧 effort 标签「Ultra」；
  // 之前把整串塞进 label 会让芯片宽 116px（cx-shell 量到 −9.05 的差异就是这条）。
  { id: "sol-ultra", label: "5.6 Sol", effort: "Ultra" },
  { id: "sol", label: "5.6 Sol" },
  { id: "sol-mini", label: "5.6 Sol Mini", effort: "低" },
];

/** 首页空态建议（新聊天时展示） */
export const NEW_CHAT_SUGGESTIONS = [
  "分析 codex-desktop-electron 的目录结构",
  "把顶部 36px 菜单栏还原成组件",
  "核对面板收起动画是否符合参考端",
];
