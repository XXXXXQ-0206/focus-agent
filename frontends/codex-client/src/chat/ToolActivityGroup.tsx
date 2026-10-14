import { useState } from "react";

import { CodexPencil, CodexTerminal } from "@/icons";
import type { ToolCall } from "@/lib/types";

import { describeToolCall, messageToBlocks } from "./block-adapter";
import { ActivityDisclosure, ActivityGroup, type ActivityStatus } from "./blocks";
import type { RuntimeMessage } from "./runtime";

/**
 * 连续的工具调用 → **一个折叠组**（用户 2026-10-15 给的官方截图口径）。
 * ============================================================================
 * 参考截图（Codex 自己的转录）里那一行是：
 *
 *   ✎ 编辑了文件运行了命令 ⌄        ← 组头：一枚 16px 图标 + 各动作词**直接拼接** + 折叠箭头
 *     ▣ 已在 1s 内运行 $npm run build
 *     ✎ 已编辑 index.html +3 -0
 *     …
 *
 * 即：同一个助手回合里**连续若干条工具活动**收成一行；展开后逐条列出（每条仍是
 * `@/chat/blocks` 的原生行）。单条工具活动**不进组**，仍按原来的单行渲染（截图里
 * "运行了命令" 那种孤立行就是这一形态）。
 *
 * 判定「只含工具活动」的口径（`isToolOnly`）：有 toolCalls、没有正文、没有推理、没有错误、
 * 且不在流式中 —— 任何一条不满足就退回普通消息渲染，避免把文字吞进折叠组里。
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
  const [expanded, setExpanded] = useState(false);
  const calls = messages.flatMap((message) => message.toolCalls ?? []);
  const blocks = messages.flatMap((message) => messageToBlocks(message));
  const status = groupStatus(calls);
  // 组头图标取**第一条**工具活动的类别（截图里组头那枚与组内首行同族）。
  const first = calls[0];
  const firstKind = first ? describeToolCall(first).kind : "exec";
  const Icon = firstKind === "exec" ? CodexTerminal : CodexPencil;

  return (
    <div className="cx-toolgroup" data-testid={dataTestId}>
      <ActivityDisclosure
        expanded={expanded}
        hasBody
        icon={<Icon size={16} />}
        itemId={`toolgroup-${messages[0]?.id ?? "x"}`}
        onToggle={() => setExpanded((open) => !open)}
        status={status}
        summary={calls.map((call) => describeToolCall(call).label).join("")}
      >
        <div className="cx-toolgroup__body">
          <ActivityGroup blocks={blocks} spacing="grouped" />
        </div>
      </ActivityDisclosure>
    </div>
  );
}
