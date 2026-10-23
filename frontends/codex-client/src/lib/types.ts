/**
 * 领域类型。
 *
 * 命名与字段尽量对齐官方渲染层的概念（thread / turn / item / workspace / project），
 * 但去掉 Focus 专有语义，只保留通用「会话 / 轮次 / 消息」模型。
 */

export interface Project {
  id: string;
  name: string;
  path: string;
  pinned?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  /** 最近活跃时间（ISO 字符串） */
  updatedAt: string;
  /** 头部展示用：是否置顶 / 未读 / 正在生成 */
  pinned?: boolean;
  unread?: boolean;
  running?: boolean;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  /** 正文（Markdown） */
  content: string;
  createdAt: string;
  /** 推理/思考块（可折叠） */
  reasoning?: string;
  /** 工具调用记录 */
  toolCalls?: ToolCall[];
  /** 是否仍在流式生成 */
  streaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  /** 一行摘要，用于折叠态 */
  summary: string;
  status: "pending" | "running" | "success" | "error";
  /** 展开后的原始输入输出 */
  input?: string;
  output?: string;
  /** 工具执行耗时（毫秒）；块头显示「已在 Ns 内运行 …」，缺省则不显示 */
  elapsedMs?: number;
}

export interface Turn {
  id: string;
  conversationId: string;
  createdAt: string;
  messages: Message[];
}

/** 输入区里可切换的「权限芯片」 */
export interface PermissionMode {
  id: string;
  label: string;
  /** 官方用橙色表达「完全访问」这类高权限档 */
  tone?: "default" | "warning";
}

export interface ModelOption {
  id: string;
  label: string;
  effort?: string;
}
