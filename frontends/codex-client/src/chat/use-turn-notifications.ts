import { useEffect, useRef } from "react";

import { useSettings } from "@/settings/store";

import type { ChatStatus } from "./use-chat";

/**
 * 「完成与通知」设置（设置 → 常规）的执行器：一轮回答结束时提示用户。
 *
 * 触发点：`status` 从 streaming 变成非 streaming 的那一帧（`ConversationView` 传进来）。
 * 两道开关都在设置里（store.ts）：
 *   · `turnCompleteNotification`：unfocused（切走窗口才提示，默认）/ always / never
 *   · `notificationSound`：default（响一声，Web Audio 合成）/ none
 *
 * 系统通知走浏览器的 Notification API：授权为 granted 才真发；
 * 处于 default（还没问过）时**只在设置不是 never 的情况下问一次**，本次不提示 ——
 * 避免"悄悄弹授权框 + 同时又没通知"的体验。被拒（denied）就不再打扰。
 */
export function useTurnNotifications(status: ChatStatus) {
  const { notificationSound, turnCompleteNotification } = useSettings();
  const previousRef = useRef(status);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = status;
    if (previous !== "streaming" || status === "streaming") return;
    if (turnCompleteNotification === "never") return;

    const focused = typeof document === "undefined" || document.hasFocus();
    if (turnCompleteNotification === "unfocused" && focused) return;

    if (notificationSound !== "none") playChime();

    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try {
        new Notification("Codex", { body: "这一轮回答已完成。" });
      } catch {
        // 某些环境（无系统通知服务的 Linux、Electron 未授权）会抛，忽略即可
      }
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, [notificationSound, status, turnCompleteNotification]);
}

/** 一声提示音（两音上行，~360ms）——不依赖任何音频资源文件 */
function playChime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const now = context.currentTime;
    for (const [offset, frequency] of [
      [0, 660],
      [0.14, 880],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.2);
    }
    window.setTimeout(() => void context.close().catch(() => undefined), 700);
  } catch {
    // 音频被策略拦下（需要用户手势）时静默跳过
  }
}
