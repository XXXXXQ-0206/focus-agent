import { useEffect, useState } from "react";

import { CodexPencil, CodexTerminal } from "@/icons";
import type { ToolCall } from "@/lib/types";

import { describeToolCall, messageToBlocks } from "./block-adapter";
import { ActivityDisclosure, ActivityGroup, type ActivityStatus } from "./blocks";
import type { RuntimeMessage } from "./types";

/**
 * 连续的工具调用 → **一个可折叠的活动组**（2026-10-20 按用户给的参考截图恢复）。
 *
 * 参考截图（Focus 转录）：
 *   ✎ 编辑了文件运行了命令  >              ← 完成态：组头 = 各动作词直接拼接，折叠
 *   …助手正文…
 *   正在思考 ⌄                           ← 运行态：组头写「正在思考」，自动展开、逐条列出
 *     ✎ 已编辑 blocks.css +3 -2
 *     ▣ 已在 6s 内运行 cd "…"
 *     ✎ 已创建 check-layout-fixes.mjs +70 -0
 *
 * 运行中展开、跑完自动收起 —— 这样既能看见正在跑的命令，完成后又不会一直占版面。
 * 单条工具活动不进组，仍按原来的单行渲染。
 */

/** 一条助手消息是否"只含工具活动"（可进组）。 */
export function isToolOnlyMessage(message: RuntimeMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.streaming) return false;
  if (message.error) return false;
  if ((message.reasoning ?? "").trim() !== "") return false;
  if (message.content.trim() !== "") return false;
  return (message.toolCalls?.length ?? 0) > 0;
}

function groupStatus(calls: ToolCall[]): ActivityStatus {
  if (calls.some((call) => call.status === "running")) return "running";
  if (calls.some((call) => call.status === "error")) return "failed";
  if (calls.every((call) => call.status === "pending")) return "stopped";
  return "completed";
}

export function ToolActivityGroup({
  messages,
  dataTestId,
}: {
  /** 组内消息（按时间序；每条都是 isToolOnlyMessage 为真的助手消息） */
  messages: RuntimeMessage[];
  dataTestId?: string;
}) {
  const calls = messages.flatMap((message) => message.toolCalls ?? []);
  const blocks = messages.flatMap((message) => messageToBlocks(message));
  const status = groupStatus(calls);
  const running = status === "running";
  // 运行中展开看每条命令；跑完自动收起成一行（用户手动展开后不再被状态变化关掉）。
  const [expanded, setExpanded] = useState(running);
  useEffect(() => {
    setExpanded(running);
  }, [running]);

  const first = calls[0];
  const firstKind = first ? describeToolCall(first).kind : "exec";
  const Icon = firstKind === "exec" ? CodexTerminal : CodexPencil;
  // 按动作归并：同类只在后面标 ×N（「运行了命令 ×2 · 编辑了文件」比把所有调用数堆在末尾准确）
  const counts = new Map<string, number>();
  for (const call of calls) {
    const label = describeToolCall(call).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = running
    ? "正在思考"
    : [...counts].map(([label, count]) => (count > 1 ? `${label} ×${String(count)}` : label)).join(" · ");

  return (
    <div className="cx-toolgroup" data-testid={dataTestId}>
      <ActivityDisclosure
        expanded={expanded}
        hasBody
        icon={<Icon size={16} />}
        itemId={`toolgroup-${messages[0]?.id ?? "x"}`}
        onToggle={() => setExpanded((open) => !open)}
        status={status}
        summary={summary}
      >
        <div className="cx-toolgroup__body">
          <ActivityGroup blocks={blocks} spacing="grouped" />
        </div>
      </ActivityDisclosure>
    </div>
  );
}
