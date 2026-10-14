import { useState } from "react";

import { CodexTerminal } from "@/icons";
import { AnsiText } from "./AnsiText";
import { CopyButton } from "./CopyButton";
import { ActivityDisclosure } from "./Disclosure";
import { CheckmarkLgLight12 } from "./icons";
import type { ActivityStatus, ExecNode } from "./types";
import { useScrollFadeMask } from "./use-scroll-fade";

/**
 * bash / shell 命令执行块（SPEC §4，**完整实测**：90 个命令块）
 * ============================================================================
 * 官方 DOM（SPEC §4.1，逐层照抄；类名 → blocks.css 的 .cx-exec__*）：
 *
 *   div.overflow-visible[data-testid="exec-shell-body"]
 *   └─ div.flex.flex-col.gap-2.pt-2.pb-1                                     → .cx-exec
 *      └─ div.group.flex.flex-col.overflow-hidden.rounded-lg.border.border-strong.bg-secondary-soft-alpha  → .cx-exec__card
 *         ├─ div.flex.flex-col.overflow-clip.rounded-none.border-none       → .cx-exec__clip
 *         │  ├─ div.flex.items-center.justify-between.gap-2.px-2.py-1.font-sans.text-sm.text-codex-description.select-none → .cx-exec__type
 *         │  ├─ div.relative.overflow-hidden → .cx-exec__body-clip
 *         │  │  └─ div.relative → .cx-exec__body
 *         │  │     ├─ div.px-2.pt-2 > div.group/command.relative.pe-6       → .cx-exec__command
 *         │  │     │  ├─ div[role=button][tabindex=0][aria-label="$ <cmd>"] → .cx-exec__command-text
 *         │  │     │  │  ├─ span.me-[1ch].text-tertiary → "$"
 *         │  │     │  │  └─ code.contents > span → 命令文本
 *         │  │     │  └─ span.contents[data-state=closed] > button[aria-label="复制"]
 *         │  │     └─ div.group/output.relative.min-h-[1.25rem].pe-0        → .cx-exec__output
 *         └─ div.flex.items-center.gap-2.px-2.5.pt-0.5.pb-1.text-size-chat.text-tertiary → .cx-exec__status
 *
 * 数值见 blocks.css 里 .cx-exec__* 的逐条注释（都带 SPEC 章节或官方 CSS 行号）。
 *
 * 状态 → 文案（SPEC §4.3 / §4.4）：
 *   running   摘要 `正在运行 <cmd>`，状态行 `正在运行`
 *   completed 摘要 `已运行 <cmd>`，状态行 `成功` + checkmark-lg-light-12（12×12）
 *   stopped   摘要 `已停止 <cmd>`，状态行 `已停止`
 *   failed    状态行 `Failed with exit code {n}`；状态**图标未实测**（SPEC §13.7）——
 *             这里复用同一枚 12px 勾并加 .is-failed 着色，**不冒充官方失败图标**。
 *
 * ★ 展开态（R4，docs/RULINGS.md）：**官方 exec 卡在流式中也不自动展开** ——
 *   sites-end-resource-ecc479065e0b.js 的 `Jx`（唯一渲染 data-testid="exec-shell-body" 的组件）
 *   是 `useState("collapsed")` + **只由用户点击改**：`O = !h && b === "expanded"`、
 *   `P = () => x(O ? "collapsed" : "expanded")`，然后把 `{expanded: O, onToggle: P}` 直接交给
 *   块头骨架（`df`），**不经过** tool-activity-disclosure 的状态机。
 *   ⇒ 本组件用**受控档**（ActivityDisclosure 的 `expanded`/`onToggle`）复刻它：
 *     展开态是自己的 useState(false)（恒从 collapsed 起步）、只有点击会翻转，
 *     **不看 status、也不读 block.defaultExpanded**（适配层已不再按 status 派生它）。
 *     与官方唯一的差异：官方状态是字符串 "collapsed"/"expanded"，这里用布尔（等价）。
 *   ⚠️ 别把它改回 defaultExpanded ——「流式展开 / 完成折叠」官方只确证于**推理块**（`Aw`），
 *      exec 卡套上去就是回到 R4 之前那条**我们自己发明的**行为。
 */

/** SPEC §4.4 的 `<action>` / `<detail>` 分色：action 60%、detail 40% */
function ExecSummary({ action, command }: { action: string; command: string }) {
  return (
    <>
      <span className="cx-summary__action">{action}</span>{" "}
      <span className="cx-summary__detail">{command}</span>
    </>
  );
}

const ACTION_BY_STATUS: Record<ActivityStatus, string> = {
  completed: "已运行",
  failed: "已运行", // 未确证：SPEC §4.4 只给了 running/ran/stopped 三条 detail
  running: "正在运行",
  stopped: "已停止",
};

const STATUS_TEXT: Record<ActivityStatus, string> = {
  completed: "成功",
  failed: "失败",
  running: "正在运行",
  stopped: "已停止",
};

function statusLabel(status: ActivityStatus, exitCode?: number | null) {
  if (status === "failed" && typeof exitCode === "number") return `Failed with exit code ${exitCode}`;
  return STATUS_TEXT[status];
}

export function ExecBlock({ block }: { block: ExecNode }) {
  const { command, exitCode, output, shell = "Shell", status } = block;
  /**
   * 官方 `Jx` 的 `let [b, x] = useState("collapsed")`：**恒从折叠起步**，且这个状态
   * **与 status 无关**（工具从 running 翻到 completed/stopped 时它不会被动过；官方同样是普通 useState）。
   * 只有块头按钮（`onToggle`）会翻转它 —— 这就是 R4 要的语义。
   */
  const [expanded, setExpanded] = useState(false);
  const fade = useScrollFadeMask<HTMLDivElement>("2rem", { reverse: true });
  const failed = status === "failed";
  const outputCopy = output ?? "";

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
      summary={block.summary ?? <ExecSummary action={ACTION_BY_STATUS[status]} command={command} />}
    >
      <div className="cx-exec" data-testid="exec-shell-body">
        <div className="cx-exec__card">
          <div className="cx-exec__clip">
            <div className="cx-exec__type">
              <span>{shell}</span>
            </div>
            <div className="cx-exec__body-clip">
              <div className="cx-exec__body">
                <div className="cx-exec__command-wrap">
                  <div className="cx-exec__command">
                    {/* 官方是 div[role=button][tabindex=0]（SPEC §4.1）；为满足本仓库 biome 的
                        a11y/useSemanticElements，改为等价的 <button>（块头另有整行按钮，不构成嵌套） */}
                    <button aria-label={`$ ${command}`} className="cx-exec__command-text" type="button">
                      <span className="cx-exec__prompt">$</span>
                      <code className="cx-exec__command-code">
                        <span>{command}</span>
                      </code>
                    </button>
                    <span className="cx-exec__copy-host">
                      <CopyButton
                        className="cx-copybtn cx-exec__copy cx-exec__copy--command"
                        text={command}
                      />
                    </span>
                  </div>
                </div>
                <div className="cx-exec__output">
                  <div
                    className="cx-exec__out-scroll"
                    ref={fade.ref}
                    style={fade.maskImage ? { maskImage: fade.maskImage } : undefined}
                  >
                    <div className="cx-exec__out-inner">
                      <AnsiText className="cx-exec__out-code" text={outputCopy} />
                    </div>
                  </div>
                  <span className="cx-exec__copy-host">
                    <CopyButton
                      className="cx-copybtn cx-exec__copy cx-exec__copy--output"
                      text={outputCopy}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="cx-exec__status">
            <span className="cx-exec__status-group">
              <span className="cx-exec__status-text">{statusLabel(status, exitCode)}</span>
              {/* ✅ SPEC §4.5：成功态 = checkmark-lg-light-12（本目录内联，12×12） */}
              <span className="cx-exec__status-icon" data-state={failed ? "failed" : "ok"}>
                <CheckmarkLgLight12 />
              </span>
            </span>
          </div>
        </div>
      </div>
    </ActivityDisclosure>
  );
}
