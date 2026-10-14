import { useCallback, useEffect, useState } from "react";

import { artexApi } from "@/artex/api";
import type { LLMPoolStatus, LLMProfile } from "@/artex/types";
import { Button, Dialog, DialogContent, Input } from "@/ui";
import { SettingsSecretInput } from "../controls";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneConfirmAction,
  PaneEmpty,
  PaneRow,
  PaneSection,
  PaneSelect,
  PaneShell,
  PaneSwitch,
  PaneValueText,
} from "./pane-kit";

/**
 * LLM 配置（2026-10-15 从「探索 → LLM」并入设置，用户要求把适合的探索页集成为设置分区）。
 *
 * 数据全走真接口（与原 `/system/llm` 页同源，只是换成原生设置页的骨架与控件）：
 *   GET  /api/llm            全局配置（provider / model / base_url / configured / key_set）
 *   POST /api/llm/test       用当前（或草稿）配置真发一次探活
 *   GET/POST/DELETE /api/llm/profiles  配置档案（列表 / 新建 / 删除 / 激活）
 *   GET  /api/llm/pool       故障转移轮询链状态（+ POST /api/llm/pool/reset 重置）
 *
 * 安全：API Key 用 `SettingsSecretInput`（可切换明文看一眼），**任何地方都不回显服务端已有的 key**
 * （列表里只显示 `api_key_hint` 这类掩码；编辑时留空 = 不改动）。
 */
export function LlmPane({ section }: SettingsPaneProps) {
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);
  const [global, setGlobal] = useState<Record<string, unknown> | null>(null);
  const [pool, setPool] = useState<LLMPoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testResult, setTestResult] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftFormat, setDraftFormat] = useState("openai");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileList, globalConfig, poolStatus] = await Promise.all([
        artexApi.llmProfiles().catch(() => [] as LLMProfile[]),
        artexApi.llm().catch(() => null),
        artexApi.llmPool().catch(() => null),
      ]);
      setProfiles(profileList);
      setGlobal(globalConfig);
      setPool(poolStatus);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法加载 LLM 配置");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const text = (key: string) => {
    const value = global?.[key];
    return typeof value === "string" ? value : "";
  };

  const runTest = async () => {
    setBusy("test");
    setTestResult("");
    try {
      const result = await artexApi.testLLM(
        text("provider") || "openai",
        text("model"),
        text("base_url"),
        "",
        text("proxy"),
      );
      setTestResult(
        result.ok
          ? `连接正常 · ${String(result.latency_ms ?? "?")} ms${result.model ? ` · ${result.model}` : ""}`
          : `失败：${result.error || "未知原因"}`,
      );
    } catch (caught) {
      setTestResult(caught instanceof Error ? caught.message : "测试失败");
    } finally {
      setBusy(null);
    }
  };

  const activate = async (profile: LLMProfile) => {
    setBusy(`activate-${profile.id}`);
    try {
      await artexApi.activateLLMProfile(profile.id);
      setNotice(`已把「${profile.name}」设为激活配置`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "激活失败");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (profile: LLMProfile) => {
    setBusy(`delete-${profile.id}`);
    try {
      await artexApi.deleteLLMProfile(profile.id);
      setNotice(`已删除「${profile.name}」`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(null);
    }
  };

  const openCreate = () => {
    setDraftId(null);
    setDraftName("");
    setDraftFormat("openai");
    setDraftModel("");
    setDraftBaseUrl("");
    setDraftKey("");
    setFormError("");
    setDialogOpen(true);
  };

  const saveProfile = async () => {
    if (!draftName.trim() || !draftModel.trim()) {
      setFormError("名称与模型必填。");
      return;
    }
    setBusy("save");
    try {
      await artexApi.saveLLMProfile({
        ...(draftId != null ? { id: draftId } : {}),
        name: draftName.trim(),
        format: draftFormat,
        model: draftModel.trim(),
        base_url: draftBaseUrl.trim(),
        ...(draftKey.trim() ? { api_key: draftKey.trim() } : {}),
      });
      setDialogOpen(false);
      setNotice("配置已保存");
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const active = profiles.find((profile) => profile.is_default);
  const configured = global?.configured === true;

  return (
    <PaneShell
      actions={
        <Button color="primary" onClick={openCreate} size="sm" variant="solid">
          添加配置
        </Button>
      }
      lede="全局模型、配置档案与故障转移轮询链。所有写入都直接落 ARTEX 服务端。"
      section={section}
      title="LLM 配置"
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

      <PaneSection
        description={
          configured
            ? `已配置 · 当前激活 ${active?.name ?? (text("model") || "（全局）")}`
            : "尚未配置：Agent 会退回规则模式，模型相关的功能不可用。"
        }
        title="全局配置"
      >
        <PaneCard>
          <PaneRow
            control={<PaneValueText title={text("provider")} value={text("provider") || "—"} />}
            description="来自 GET /api/llm（服务端当前生效值）"
            label="服务商"
          />
          <PaneRow
            control={<PaneValueText mono title={text("model")} value={text("model") || "—"} />}
            description="请求体里的 model"
            label="模型"
          />
          <PaneRow
            control={<PaneValueText mono title={text("base_url")} value={text("base_url") || "—"} />}
            description="OpenAI / Anthropic 兼容端点；留空走官方地址"
            label="接入地址"
          />
          <PaneRow
            control={<PaneValueText value={global?.key_set === true ? "已配置（不回显）" : "未配置"} />}
            description="出于安全考虑这里只显示是否配置；改 key 请在下面添加/编辑配置档案"
            label="API Key"
          />
          <PaneRow
            control={
              <span className="cx-pane__row-actions">
                {testResult ? <span className="cx-pane__row-description">{testResult}</span> : null}
                <Button
                  color="secondary"
                  disabled={busy === "test" || !configured}
                  onClick={() => void runTest()}
                  size="sm"
                  variant="soft"
                >
                  {busy === "test" ? "测试中…" : "测试连接"}
                </Button>
              </span>
            }
            description="用服务端当前配置真发一次探活请求（POST /api/llm/test）"
            label="连通性"
          />
        </PaneCard>
      </PaneSection>

      <PaneSection
        description={
          profiles.length === 0
            ? "还没有配置档案：添加一个后在任务里就能指定它"
            : `${String(profiles.length)} 个档案，激活项会作为默认；带「池」的档案参与故障转移`
        }
        title="配置档案"
      >
        <PaneCard>
          {loading && profiles.length === 0 ? (
            <PaneEmpty description="正在读取服务端的 LLM 配置档案。" title="正在加载…" />
          ) : profiles.length === 0 ? (
            <PaneEmpty
              action={
                <Button color="primary" onClick={openCreate} size="sm" variant="solid">
                  添加配置
                </Button>
              }
              description="点右上角「添加配置」填名称 / 格式 / 模型 / 地址 / Key。"
              title="暂无配置档案"
            />
          ) : (
            profiles.map((profile) => (
              <PaneRow
                description={
                  <span>
                    {profile.format} · {profile.model}
                    {profile.base_url ? ` · ${profile.base_url}` : ""}
                    {profile.api_key_hint ? ` · Key ${profile.api_key_hint}` : ""}
                    {profile.pool_exclude ? " · 不参与池" : ""}
                  </span>
                }
                key={profile.id}
                label={
                  <span className="cx-pane__row-label">
                    {profile.name}
                    {profile.is_default ? <span className="cx-pane__tag">激活</span> : null}
                  </span>
                }
                control={
                  <span className="cx-pane__row-actions">
                    <Button
                      color="secondary"
                      disabled={busy === `activate-${profile.id}` || profile.is_default}
                      onClick={() => void activate(profile)}
                      size="sm"
                      variant="ghost"
                    >
                      激活
                    </Button>
                    <PaneConfirmAction
                      confirmLabel="删除"
                      danger
                      description="删除后引用它的任务会回落到全局配置或激活档案。"
                      onConfirm={() => void remove(profile)}
                      title={`删除配置「${profile.name}」？`}
                      trigger={
                        <Button
                          color="danger"
                          disabled={busy === `delete-${profile.id}`}
                          size="sm"
                          variant="ghost"
                        >
                          删除
                        </Button>
                      }
                    />
                  </span>
                }
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <PaneSection
        description={
          pool
            ? pool.enabled
              ? `轮询已启用 · 链上 ${String(pool.chain.length)} 个成员`
              : "轮询未启用（在「Agent 运行 → LLM 故障转移」里开）"
            : "无法读取池状态"
        }
        title="故障转移池"
      >
        <PaneCard>
          {!pool || pool.chain.length === 0 ? (
            <PaneEmpty description="启用轮询并给档案勾选参与池后，链成员会显示在这里。" title="池为空" />
          ) : (
            pool.chain.map((member) => (
              <PaneRow
                description={
                  <span>
                    {member.name} · {member.model}
                    {` · ${member.state}`}
                    {member.fails > 0 ? ` · 失败 ${String(member.fails)} 次` : ""}
                    {member.excluded ? " · 已排除" : ""}
                    {member.active ? " · 当前" : ""}
                  </span>
                }
                key={member.profile_id}
                label={`#${member.profile_id}`}
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError("");
        }}
        open={dialogOpen}
      >
        <DialogContent
          description="写入 ARTEX 的 LLM 配置档案（/api/llm/profiles）；API Key 留空表示不改动。"
          footer={
            <>
              <Button color="secondary" onClick={() => setDialogOpen(false)} size="sm" variant="ghost">
                取消
              </Button>
              <Button
                color="primary"
                disabled={busy === "save"}
                onClick={() => void saveProfile()}
                size="sm"
                variant="solid"
              >
                {busy === "save" ? "保存中…" : "保存"}
              </Button>
            </>
          }
          title={draftId != null ? "编辑 LLM 配置" : "添加 LLM 配置"}
        >
          <div className="artex-task-create">
            <label className="artex-task-create__field" htmlFor="llm-name">
              <span>名称</span>
              <Input
                id="llm-name"
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：DeepSeek 官方"
                value={draftName}
              />
            </label>
            <div className="artex-task-create__field">
              <span>格式</span>
              <PaneSelect
                ariaLabel="LLM 格式"
                onChange={setDraftFormat}
                options={[
                  { value: "openai", label: "openai", description: "OpenAI 兼容 /chat/completions" },
                  { value: "anthropic", label: "anthropic", description: "Anthropic Messages" },
                  { value: "openai-responses", label: "openai-responses", description: "Responses API" },
                ]}
                value={draftFormat}
              />
            </div>
            <label className="artex-task-create__field" htmlFor="llm-model">
              <span>模型</span>
              <Input
                id="llm-model"
                onChange={(event) => setDraftModel(event.target.value)}
                placeholder="例如：deepseek-chat"
                value={draftModel}
              />
            </label>
            <label className="artex-task-create__field" htmlFor="llm-base">
              <span>接入地址（可选）</span>
              <Input
                id="llm-base"
                onChange={(event) => setDraftBaseUrl(event.target.value)}
                placeholder="https://api.deepseek.com"
                value={draftBaseUrl}
              />
            </label>
            <div className="artex-task-create__field">
              <span>API Key（留空 = 不改动）</span>
              <SettingsSecretInput label="API Key" onChange={setDraftKey} value={draftKey} />
            </div>
            {formError ? (
              <p className="artex-codex-error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </PaneShell>
  );
}
