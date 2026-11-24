import { useCallback, useEffect, useState } from "react";

import { CodexRefresh } from "@/icons";
import { SlatePage } from "@/pages/parts";
import { PaneBanner, PaneCard, PaneEmpty, PaneRow, PaneSection } from "@/settings/panes/pane-kit";
import { Button } from "@/ui";
import { artexApi } from "./api";
import type { Approval } from "./types";

/**
 * 审批（`/approvals`）—— 需要人工确认的调用队列。
 *
 * ★ 2026-10-15（产品重排，用户点名的例子）：
 *   「审批」是**待办**而不是配置 ⇒ 从设置搬到左侧栏，与「任务」同级；
 *   设置里的「审批与拦截」只保留策略（临时自动放行 / 拦截规则），并在那里放一个
 *   跳回本页的入口。裁决后的历史记录仍然在任务页的「拦截」视图里逐任务可查。
 *
 * 数据与动作沿用原实现（没有新建接口）：
 *   `GET  /api/intercept/pending`                    —— 待审批列表
 *   `POST /api/intercept/pending/{id}/decide`        —— 放行 / 拒绝
 *
 * 骨架：SlatePage = 设置页同款（标题带 60 + 768 列 + 728 内容）；行/卡片用设置页的
 * pane-kit（PaneSection / PaneCard / PaneRow），与设置页逐值同源。
 */
export function ArtexApprovalsPage() {
  const [pending, setPending] = useState<Approval[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPending(await artexApi.approvals());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取待审批队列");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (approval: Approval, decision: "allowed" | "denied") => {
    setDecidingId(approval.id);
    try {
      await artexApi.interceptDecide(approval.id, decision);
      setPending((current) => current.filter((item) => item.id !== approval.id));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "裁决失败");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <SlatePage
      actions={
        <button
          aria-label="刷新待审批队列"
          className="cx-slate-iconbutton"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <CodexRefresh size={16} />
        </button>
      }
      subtitle="Agent 触发的敏感调用会在这里排队，逐条看命令与理由后放行或拒绝；策略与拦截规则在「设置 → 审批与拦截」。"
      title="审批"
    >
      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="读写出错"
          tone="danger"
        />
      ) : null}

      <PaneSection
        description={
          loading
            ? "正在读取…"
            : pending.length === 0
              ? "没有等待裁决的调用"
              : `${String(pending.length)} 条等待裁决：逐条看命令与理由后放行或拒绝`
        }
        title="待审批"
      >
        <PaneCard>
          {pending.length === 0 ? (
            <PaneEmpty
              description="Agent 触发需要人工确认的动作时，会出现在这里（也可在任务页的「拦截」视图查看该任务的记录）。"
              title={loading ? "正在加载…" : "当前无待审批"}
            />
          ) : (
            pending.map((approval) => (
              <PaneRow
                control={
                  <span className="cx-pane__row-actions">
                    <Button
                      color="success"
                      disabled={decidingId !== null}
                      onClick={() => void decide(approval, "allowed")}
                      size="sm"
                      variant="soft"
                    >
                      允许调用
                    </Button>
                    <Button
                      color="danger"
                      disabled={decidingId !== null}
                      onClick={() => void decide(approval, "denied")}
                      size="sm"
                      variant="ghost"
                    >
                      拒绝
                    </Button>
                  </span>
                }
                description={
                  <span>
                    {approval.agent_name || "agent"} · {approval.reason || "等待决定"}
                    {approval.task_id ? ` · 任务 ${approval.task_id}` : ""}
                    {approval.created_at ? ` · ${approval.created_at}` : ""}
                    {approval.tool_input && Object.keys(approval.tool_input).length > 0 ? (
                      <>
                        {" · "}
                        <code>{JSON.stringify(approval.tool_input).slice(0, 120)}</code>
                      </>
                    ) : null}
                  </span>
                }
                key={approval.id}
                label={approval.tool_name}
              />
            ))
          )}
        </PaneCard>
      </PaneSection>
    </SlatePage>
  );
}
