import { useMemo } from "react";

import { CONVERSATIONS, MESSAGES } from "./mock-data";
import type { Conversation, Message } from "./types";

/**
 * 会话与消息读取层。
 *
 * 当前是纯本地同步实现，接口签名刻意做成"可替换成异步"的形状：
 * 接后端时把 useConversations / useMessages 换成 useQuery 即可，组件侧不用改。
 *
 * ⚠️ 但「运行期产生的会话」**不在**本文件的数据源里 —— 它们由调用方注入（结构化类型）。
 * 依赖方向是**调用方注入**：本文件只声明合并真正读到的字段，不反向 import 任何会话侧模块。
 *
 * 历史：这些「运行期记录」原本来自 `src/chat/runtime` 的 localStorage 索引
 * （2026-10-16 已随直连链路删除）。`mergeConversations()` 这个汇合点保留着 ——
 * 现在侧栏的「最近」由 ARTEX 会话列表与样例数据汇合，形状不变。
 */

/**
 * 合并用的「运行时会话记录」形状。
 *
 * 这里只声明合并**真正读到**的字段，多出来的（messageCount / origin）由调用方保留。
 * 结构化类型 —— 调用方把记录直接传进来即可，不需要它 import 谁的类型。
 */
export interface RuntimeConversationLike {
  id: string;
  /** 标题（运行期记录里通常由首条用户消息派生） */
  title?: string;
  /** 最近活跃时间（ISO 字符串） */
  updatedAt?: string;
  createdAt?: string;
}

/** ISO 时间串 → epoch 毫秒；解不出时间的一律当 0（排到最旧，不给「永远最新」的假象） */
function timeOf(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * 样例会话 × 运行时会话 → 一份可直接渲染的列表（侧栏「最近」的唯一数据源）。
 *
 * 三条口径（都是既有契约，不要在一次改动里偷换成别的）：
 *  1. **去重**：同一个 id 只出一次。冲突时**运行期记录胜** —— 它带着真实的消息计数与
 *     时间戳。记录里没有的字段（pinned / unread / projectId）从样例那条继承，
 *     因为它不写这些字段，直接覆盖会把「置顶」丢成 undefined。
 *  2. **排序**：updatedAt 倒序。比较用 epoch 毫秒而不是 ISO 字符串 ——
 *     字符串比较在跨时区偏移（`+08:00` vs `Z`）时会排错。
 *  3. **标题以运行期记录为准**：两边取的是**同一个字段**（`title ?? runtimeRecord?.title`），
 *     不会出现一个显示「新聊天」、另一个显示真标题。
 *
 * @param samples 样例会话（@/lib 的 CONVERSATIONS / useConversations()）
 * @param runtime 运行期记录（调用方注入，结构化类型）
 */
export function mergeConversations(
  samples: readonly Conversation[],
  runtime: readonly RuntimeConversationLike[],
): Conversation[] {
  const byId = new Map<string, Conversation>();
  // 先放样例、再放运行时：后面写入的覆盖前面的 → runtime 胜
  for (const conversation of samples) byId.set(conversation.id, { ...conversation });
  for (const record of runtime) {
    if (!record?.id) continue;
    const sample = byId.get(record.id);
    const updatedAt = record.updatedAt ?? record.createdAt ?? sample?.updatedAt ?? new Date(0).toISOString();
    const title = (record.title ?? "").trim() || sample?.title || "新聊天";
    byId.set(record.id, { ...sample, id: record.id, title, updatedAt });
  }
  return [...byId.values()].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}

export function listConversations(): Conversation[] {
  return [...CONVERSATIONS].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}

export function listMessages(conversationId: string | undefined): Message[] {
  if (!conversationId) return [];
  return MESSAGES[conversationId] ?? [];
}

/** 样例会话列表。runtime 会话由调用方通过 mergeConversations 合并（见本文件顶部说明）。 */
export function useConversations() {
  return useMemo(() => listConversations(), []);
}

export function useMessages(conversationId: string | undefined) {
  return useMemo(() => listMessages(conversationId), [conversationId]);
}

export function findConversation(id: string | undefined) {
  if (!id) return undefined;
  return CONVERSATIONS.find((c) => c.id === id);
}

/** 按更新时间把会话分成「今天 / 更早」，用于面板的「最近」分组（输入须已按 updatedAt 倒序） */
export function groupByRecency(conversations: Conversation[]) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const today: Conversation[] = [];
  const earlier: Conversation[] = [];
  for (const c of conversations) {
    (now - timeOf(c.updatedAt) < dayMs ? today : earlier).push(c);
  }
  return { today, earlier };
}
