import { useState } from "react";

import { CodexTerminal } from "@/icons";
import { AnsiText } from "./AnsiText";
import { CopyButton } from "./CopyButton";
import { ActivityDisclosure } from "./Disclosure";
import type { TerminalNode } from "./types";
import { useScrollFadeMask } from "./use-scroll-fade";

/**
 * 终端 ANSI 输出块（SPEC §5，**包内确证**）
 * ============================================================================
 * 官方把 ANSI 渲染放在命令块的输出区里（`code > span[class="ansi-*-fg …"]`）。
 * 本组件把同一渲染器抽成**独立块**，供"纯终端输出"使用：
 *   • 外壳复用 SPEC §4 的卡片（类名/尺寸同为实测值）
 *   • 正文是 §5 的 ANSI DOM（`AnsiText`）
 *
 * ⚠️ SPEC §13.9：色板与类名机制确证，但**未在真实彩色终端输出上实测**。
 * ⚠️ 独立块形态本身是**推断**：官方会话里 ANSI 只作为命令块输出出现（SPEC §10 的 exec 项）。
 *
 * ★ 展开态（R4，docs/RULINGS.md）：本块渲染的**就是**官方 exec 卡那层壳
 *   （`data-testid="exec-shell-body"`，官方唯一渲染它的是 `Jx`：`useState("collapsed")` +
 *   只由用户点击改、`{expanded,onToggle}` 直给块头骨架，不经过 tool-activity-disclosure 状态机）。
 *   我们的适配层把「shell 类工具」映射成 exec、其余工具映射成 terminal（见 block-adapter.ts），
 *   而官方 `Kx` 的分派是「read / search / list_files 之外**全走 Jx**」—— 也就是说**通用工具**在官方
 *   同样落在这张卡上 ⇒ 这里必须与 ExecBlock 同档：**恒从 collapsed 起步、仅用户点击切换**，
 *   不能走状态机档（否则通用工具在 running 时会自动展开，同 R4 要修的那条偏差）。
 */

const STATUS_TEXT = {
  completed: "成功",
  failed: "失败",
  running: "正在运行",
  stopped: "已停止",
} as const;

export function TerminalBlock({ block }: { block: TerminalNode }) {
  const { exitCode, shell = "Shell", status, text } = block;
  /** 同 ExecBlock（官方 Jx）：恒从折叠起步、只由用户点击改，与 status 无关 —— 见文件头 ★ */
  const [expanded, setExpanded] = useState(false);
  const fade = useScrollFadeMask<HTMLDivElement>("2rem", { reverse: true });

  return (
    <ActivityDisclosure
      active={status === "running"}
      bodyVariant="default"
      expanded={expanded}
      icon={<CodexTerminal size={16} />}
      indent={false}
      itemId={block.id}
      onToggle={() => setExpanded((open) => !open)}
      status={status}
      summary={
        block.summary ?? (
          <>
            <span className="cx-summary__action">{shell}</span>{" "}
            <span className="cx-summary__detail">终端输出</span>
          </>
        )
      }
    >
      <div className="cx-exec" data-testid="exec-shell-body">
        <div className="cx-exec__card">
          <div className="cx-exec__clip">
            <div className="cx-exec__type">
              <span>{shell}</span>
            </div>
            <div className="cx-exec__body-clip">
              <div className="cx-exec__body">
                <div className="cx-exec__output">
                  <div
                    className="cx-exec__out-scroll"
                    ref={fade.ref}
                    style={fade.maskImage ? { maskImage: fade.maskImage } : undefined}
                  >
                    <div className="cx-exec__out-inner">
                      <AnsiText className="cx-exec__out-code" text={text} />
                    </div>
                  </div>
                  <span className="cx-exec__copy-host">
                    <CopyButton className="cx-copybtn cx-exec__copy cx-exec__copy--output" text={text} />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="cx-exec__status">
            <span className="cx-exec__status-group">
              <span className="cx-exec__status-text">
                {status === "failed" && typeof exitCode === "number"
                  ? `Failed with exit code ${exitCode}`
                  : STATUS_TEXT[status]}
              </span>
            </span>
          </div>
        </div>
      </div>
    </ActivityDisclosure>
  );
}
