import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/settings/store";

import { hasComposerContent } from "./can-send";
import type { ChatStatus } from "./use-chat";

/**
 * 「跟进方式」设置（设置 → 常规 → 跟进 / 排队方式，store.followUpMode）的执行器。
 *
 * 语义（官方 zh-CN 文案：排队 / 引导）：
 *   queue —— 回答还在生成时发出的消息**排队**，等这一轮结束再自动发出（默认）；
 *   steer —— 回答还在生成时发出的消息**立即打断**当前生成，然后把这条发出去。
 *
 * 实现：两条路都先把文本放进队列，等 `status` 回到 idle 再真正 `send`；
 * 「引导」额外在放入时调一次 `stop()` 触发中断。这样不需要改运行时的状态机 ——
 * `sendAsync` 只在空闲相位接受新回合（runtime.ts 的 isActivePhase 守卫），
 * 排队语义恰好就是「等它空下来」。
 *
 * ★ 2026-10-15（用户：给排队中的消息做出官方那条约（截图））：
 *   队列从 `useRef<string|null>` 改成 **state 数组**，对外暴露 `queued` 与三个动作，
 *   由 ConversationView 渲染成「插入对话」行（src/chat/QueuedMessageBar.tsx）：
 *     · steer(id)  —— 引导：把这条提到队首并打断当前生成（状态回 idle 后立即发出）；
 *     · remove(id) —— 删除：从队列里拿掉；
 *     · edit(id)   —— 编辑：从队列里拿掉，并把它放回输入框（Composer 监听
 *                     `codex:composer-set-text` 事件，见 Composer.tsx）。
 */

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: File[];
  /** 队列归属（首页 / conversation:<id> / task:<id>）。 */
  scopeKey: string;
}

export function useFollowUp(
  status: ChatStatus,
  send: (text: string, attachments?: File[], fromQueue?: boolean) => void,
  stop: () => void,
  scopeKey: string,
) {
  const { followUpMode } = useSettings();
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const seqRef = useRef(0);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  // 队列的最新快照：edit() 需要在**状态更新函数之外**读到待编辑文本（更新函数里发事件
  // 属于副作用，StrictMode 下会被调用两次 ⇒ 输入框会被写两遍）。
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const enqueue = useCallback((text: string, attachments: File[], steerNow: boolean): string => {
    seqRef.current += 1;
    const item: QueuedMessage = {
      id: `queued-${seqRef.current}`,
      text,
      attachments,
      scopeKey: scopeRef.current,
    };
    setQueue((current) => (steerNow ? [item, ...current] : [...current, item]));
    return item.id;
  }, []);

  const submit = (text: string, attachments: File[] = []) => {
    const trimmed = text.trim();
    if (!hasComposerContent(trimmed, attachments.length)) return false;
    if (statusRef.current !== "streaming") {
      send(trimmed, attachments);
      return false;
    }
    enqueue(trimmed, attachments, followUpMode === "steer");
    if (followUpMode === "steer") stop();
    return true;
  };

  // 会话/任务切换时丢弃旧作用域的队列，绝不让附件或文本跨目标发送。
  useEffect(() => {
    setQueue((current) => current.filter((item) => item.scopeKey === scopeKey));
  }, [scopeKey]);

  /** 轮次一结束就把队首那条发出去（FIFO；一次只发一条，剩下等下一轮空闲）。 */
  useEffect(() => {
    if (status === "streaming" || queue.length === 0) return;
    const [head] = queue;
    if (head.scopeKey !== scopeKey) {
      setQueue((current) => current.filter((item) => item.scopeKey === scopeKey));
      return;
    }
    setQueue((current) => current.slice(1));
    send(head.text, head.attachments, true);
  }, [queue, scopeKey, send, status]);

  /** 引导：立即打断当前生成，并把这条插到队首（它会先于其它排队消息发出）。 */
  const steer = useCallback(
    (id: string) => {
      setQueue((current) => {
        const item = current.find((entry) => entry.id === id);
        if (!item) return current;
        return [item, ...current.filter((entry) => entry.id !== id)];
      });
      stop();
    },
    [stop],
  );

  const remove = useCallback((id: string) => {
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }, []);

  /** 编辑：从队列拿掉，并把原文放回输入框（Composer 的事件桥）。 */
  const edit = useCallback((id: string) => {
    const item = queueRef.current.find((entry) => entry.id === id);
    setQueue((current) => current.filter((entry) => entry.id !== id));
    if (item && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("codex:composer-set-text", { detail: { text: item.text } }));
    }
  }, []);

  return {
    /**
     * 生成中**始终允许**发送（官方：运行中只要输入框有字，右侧就是发送键而不是停止键 ——
     * 用户 2026-10-15 的排队截图里正是如此）。「跟进方式」这个设置决定的是**发出去之后**
     * 怎么处理：引导 = 立刻打断再发；排队 = 进队列，等这一轮结束再发。
     *
     * ⚠️ 这里改过一条旧口径：此前是 `status === "streaming" && followUpMode === "steer"`，
     * 于是**排队模式下生成中根本发不出消息**（Composer 的 canSend 为 false），
     * 「排队」这个选项等于死设置；而官方是真的会把它排起来（见 QueuedMessageBar）。
     */
    allowSteer: status === "streaming",
    submit,
    queued: queue.filter((item) => item.scopeKey === scopeKey),
    steer,
    remove,
    edit,
  };
}
