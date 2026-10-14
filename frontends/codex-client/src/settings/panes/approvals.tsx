import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { artexApi } from "@/artex/api";
import type { Approval, AutoAllowState, InterceptRule } from "@/artex/types";
import { Button, Input } from "@/ui";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneConfirmAction,
  PaneEmpty,
  PaneRow,
  PaneSection,
  PaneShell,
  PaneSwitch,
} from "./pane-kit";

/**
 * 审批与拦截（2026-10-15 从「探索 → 审批」整页并入设置）。
 *
 * 数据：`GET/PUT /api/guard/auto-allow`（临时自动放行：开关 + 剩余时长）、
 *      `GET /api/intercept/rules` + `POST /api/intercept/rules/{id}/toggle` + `DELETE …`（拦截规则）。
 *      `GET /api/intercept/pending` + `POST /api/intercept/pending/{id}/decide`（待审批队列的裁决）。
 *
 * ⚠️ 2026-10-15 第二轮：用户判定「整个项目不再需要独立的审批页」，于是把**队列与裁决**
 * 也从 `/system/intercept/approvals` 搬到这里（那条路由现在重定向到本页）——
 * 人工审批这条安全闸门不能消失，只是不再单独占一个页面。
 */
export function ApprovalsPane({ section }: SettingsPaneProps) {
  const navigate = useNavigate();
  const [autoAllow, setAutoAllow] = useState<AutoAllowState | null>(null);
  const [rules, setRules] = useState<InterceptRule[]>([]);
  const [pending, setPending] = useState<Approval[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [hours, setHours] = useState("2");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allow, ruleList, pendingList] = await Promise.all([
        artexApi.getAutoAllow().catch(() => null),
        artexApi.interceptRules().catch(() => [] as InterceptRule[]),
        artexApi.approvals().catch(() => [] as Approval[]),
      ]);
      setAutoAllow(allow);
      setRules(ruleList);
      setPending(pendingList);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取审批配置");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setAllow = async (enabled: boolean) => {
    setBusy("allow");
    try {
      const parsedHours = Math.max(1, Math.min(72, Number(hours) || 2));
      setAutoAllow(await artexApi.setAutoAllow(enabled, parsedHours));
      setNotice(enabled ? `已开启自动放行 ${String(parsedHours)} 小时` : "已关闭自动放行");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const toggleRule = async (rule: InterceptRule, enabled: boolean) => {
    setBusy(`rule-${String(rule.id)}`);
    try {
      await artexApi.toggleInterceptRule(rule.id, enabled);
      setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, enabled } : item)));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切换规则失败");
    } finally {
      setBusy(null);
    }
  };

  const removeRule = async (rule: InterceptRule) => {
    setBusy(`rule-${String(rule.id)}`);
    try {
      await artexApi.deleteInterceptRule(rule.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除规则失败");
    } finally {
      setBusy(null);
    }
  };

  const remaining = autoAllow?.remaining_seconds ?? 0;
  const allowedNow = autoAllow?.enabled === true;

  const decide = async (approval: Approval, decision: "allowed" | "denied") => {
    setDecidingId(approval.id);
    try {
      await artexApi.interceptDecide(approval.id, decision);
      setPending((current) => current.filter((item) => item.id !== approval.id));
      setNotice(decision === "allowed" ? "已允许这次调用" : "已拒绝这次调用");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "裁决失败");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <PaneShell
      actions={
        <Button
          color="secondary"
          onClick={() => navigate("/intranet")}
          size="sm"
          variant="ghost"
          title="会话与凭据在「连接与流量」里"
        >
          内网作战台
        </Button>
      }
      lede="放行策略、拦截规则与待审批队列；裁决后的记录在任务页的「拦截」视图里。"
      section={section}
      title="审批与拦截"
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
      {notice ? <PaneBanner title={notice} tone="success" /> : null}

      {/* ── 待审批队列（原审批页的核心动作）────────────────────────────── */}
      <PaneSection
        description={
          pending.length === 0
            ? "没有等待裁决的调用"
            : `${String(pending.length)} 条等待裁决：逐条看命令与理由后放行或拒绝`
        }
        title="待审批"
      >
        <PaneCard>
          {pending.length === 0 ? (
            <PaneEmpty
              description="Agent 触发需要人工确认的动作时，会出现在这里（也可在任务页的「拦截」视图查看该任务的记录）。"
              title="当前无待审批"
            />
          ) : (
            pending.map((approval) => (
              <PaneRow
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
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <PaneSection
        description={
          loading
            ? "正在读取…"
            : allowedNow
              ? `已开启 · 剩余约 ${String(Math.ceil(remaining / 60))} 分钟`
              : "关闭（危险动作仍需逐条批准）"
        }
        title="临时自动放行"
      >
        <PaneCard>
          <PaneRow
            control={
              <PaneSwitch
                checked={allowedNow}
                disabled={busy === "allow"}
                label="临时自动放行"
                onChange={(value) => void setAllow(value)}
              />
            }
            description="开启后这段时间内的审批请求自动放行；到点自动关闭"
            label="自动放行"
          />
          <PaneRow
            control={
              <span className="cx-pane__input-group">
                <Input
                  aria-label="自动放行时长（小时）"
                  className="cx-pane__input cx-pane__input--w160"
                  disabled={busy === "allow" || allowedNow}
                  min={1}
                  onChange={(event) => setHours(event.target.value)}
                  size="sm"
                  type="number"
                  value={hours}
                />
                <span className="cx-pane__row-description">小时</span>
              </span>
            }
            description="开启时生效（1–72 小时）；已开启时先关掉再改"
            label="时长"
          />
        </PaneCard>
      </PaneSection>

      <PaneSection
        description={
          rules.length === 0
            ? "暂无规则：所有工具调用都会进入人工审批"
            : `${String(rules.length)} 条规则，按优先级生效`
        }
        title="拦截规则"
      >
        <PaneCard>
          {rules.length === 0 ? (
            <PaneEmpty
              description="规则在「审批」页里创建（要填匹配目标 / 类型 / 正则与动作）。"
              title="暂无拦截规则"
            />
          ) : (
            rules.map((rule) => (
              <PaneRow
                description={
                  <span>
                    {rule.match_target} · {rule.match_type} · <code>{rule.pattern}</code> · 动作 {rule.action}{" "}
                    · 优先级 {String(rule.priority)}
                    {rule.timeout_enabled
                      ? ` · 超时 ${String(rule.timeout_seconds)}s → ${rule.timeout_action}`
                      : ""}
                  </span>
                }
                key={rule.id}
                label={rule.name}
                control={
                  <span className="cx-pane__row-actions">
                    <PaneConfirmAction
                      confirmLabel="删除"
                      danger
                      description="删除后该模式不再被这条规则匹配。"
                      onConfirm={() => void removeRule(rule)}
                      title={`删除规则「${rule.name}」？`}
                      trigger={
                        <Button
                          color="danger"
                          disabled={busy === `rule-${String(rule.id)}`}
                          size="sm"
                          variant="ghost"
                        >
                          删除
                        </Button>
                      }
                    />
                    <PaneSwitch
                      checked={rule.enabled}
                      disabled={busy === `rule-${String(rule.id)}`}
                      label={`${rule.name} 启用`}
                      onChange={(value) => void toggleRule(rule, value)}
                    />
                  </span>
                }
              />
            ))
          )}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
