import { useCallback, useEffect, useRef, useState } from "react";

import { useMessages } from "@/lib/conversations";
import { PROJECTS } from "@/lib/mock-data";
import type { Message } from "@/lib/types";
import { CHAT_MODELS, DEFAULT_MODEL_ID, MAX_EFFORT } from "./options";

/**
 * 会话状态层（本地实现，接口刻意做成「可替换成后端」的形状）。
 *
 * 这里**不是**假数据写死：消息来自 @/lib 的 mock 数据源（useMessages），
 * 发送/停止/流式只是在这个数据源之上做本地增量。接后端时把 `send` 的实现换成
 * 一次 fetch + SSE，组件侧不用改。
 *
 * 本地增量按「会话归属」存放（draftState.conversationId）：切会话时同一份 state
 * 自然失效，不需要在 effect 里手动清空，也不会出现跨会话串消息。
 */

export type ChatStatus = "idle" | "streaming";

/** 本地「后端」回复：把一段带标题/列表/代码块的 Markdown 按字流式吐出来 */
function buildReply(prompt: string) {
  return [
    "收到。先给出结论，再给出可复算的依据。",
    "",
    "## 结论",
    "",
    `针对「${prompt.trim() || "这个问题"}」，最短路径是：`,
    "",
    "1. 先在参考端量到确定性数值",
    "2. 再按**作者值**实现，而不是按 computed 的取整结果",
    "3. 最后用几何断言回归",
    "",
    "## 示例",
    "",
    "```ts",
    "// 面板宽度恒定，收起只做位移",
    "const COLLAPSED_INLINE_START = -236;",
    "function collapsedTransform(width: number) {",
    '  return "translateX(-" + width + "px)";',
    "}",
    "```",
    "",
    "> 需要我继续展开哪一步？",
  ].join("\n");
}

const CHUNK_MS = 18;

interface DraftState {
  conversationId: string | undefined;
  messages: Message[];
}

export function useChatSession(conversationId: string | undefined) {
  const seeded = useMessages(conversationId);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // 只认领属于当前会话的本地增量
  const draftMessages =
    draftState && draftState.conversationId === conversationId ? draftState.messages : null;
  const messages = draftMessages ?? seeded;

  // 切会话：丢弃不属于新会话的增量，并停掉上一个会话的流式
  useEffect(() => {
    setDraftState((current) => (current && current.conversationId === conversationId ? current : null));
    cancelledRef.current = true;
    setStatus("idle");
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [conversationId]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    },
    [],
  );

  const patchStreaming = useCallback((id: string, patch: Partial<Message>) => {
    setDraftState((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          }
        : current,
    );
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("idle");
    setDraftState((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          }
        : current,
    );
  }, []);

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content) return;
      const now = new Date().toISOString();
      const userMessage: Message = {
        id: `local-user-${Date.now()}`,
        conversationId: conversationId ?? "draft",
        role: "user",
        content,
        createdAt: now,
      };
      const assistantId = `local-assistant-${Date.now()}`;
      const reply = buildReply(content);

      cancelledRef.current = false;
      setStatus("streaming");
      setDraftState((current) => {
        const base = current && current.conversationId === conversationId ? current.messages : seeded;
        return {
          conversationId,
          messages: [
            ...base,
            userMessage,
            {
              id: assistantId,
              conversationId: conversationId ?? "draft",
              role: "assistant",
              content: "",
              createdAt: now,
              streaming: true,
            },
          ],
        };
      });

      let cursor = 0;
      timerRef.current = window.setInterval(() => {
        if (cancelledRef.current) return;
        cursor = Math.min(reply.length, cursor + 3);
        patchStreaming(assistantId, { content: reply.slice(0, cursor), streaming: cursor < reply.length });
        if (cursor >= reply.length) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setStatus("idle");
        }
      }, CHUNK_MS);
    },
    [conversationId, patchStreaming, seeded],
  );

  const retry = useCallback(
    (messageId: string) => {
      const list = draftMessages ?? seeded;
      const index = list.findIndex((m) => m.id === messageId);
      if (index < 0) return;
      const lastUser = [...list.slice(0, index)].reverse().find((m) => m.role === "user");
      const kept = list.slice(0, index);
      setDraftState({ conversationId, messages: kept });
      if (lastUser) send(lastUser.content);
    },
    [conversationId, draftMessages, seeded, send],
  );

  return { messages, status, send, stop, retry };
}

/** 输入区里可切换的芯片状态（模型 / 强度），本地保存。
 *
 * 数据源：./options 的 CHAT_MODELS。
 * 默认档 = 参考端采集时的当前档：模型「5.6 Sol」+ 强度「Ultra」，
 * 出处 captures/blocks-chat-home.json（芯片 107.03125×28 / 85.333×28）。
 */
export function useComposerSelection() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [effort, setEffort] = useState<string>(MAX_EFFORT);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  const model = CHAT_MODELS.find((m) => m.id === modelId) ?? CHAT_MODELS[0];
  const project = PROJECTS.find((p) => p.id === projectId);

  return {
    model,
    modelId,
    setModelId,
    effort,
    setEffort,
    project,
    projectId,
    setProjectId,
  };
}
