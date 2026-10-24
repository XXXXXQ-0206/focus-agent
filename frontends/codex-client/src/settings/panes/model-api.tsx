import { useCallback, useEffect, useState } from "react";

import { artexApi } from "@/artex/api";
import type { LLMPoolStatus, LLMProfile } from "@/artex/types";
import { Button, Input } from "@/ui";
import { SettingsSecretInput } from "../controls";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneConfirmAction,
  PaneEmpty,
  PaneInputRow,
  PaneRow,
  PaneSection,
  PaneSelect,
  PaneShell,
  PaneSwitch,
} from "./pane-kit";

/**
 * 模型与 API —— 2026-10-15 由「LLM 配置」+「自定义 API」两页**合并**而来，
 * 交互模型按用户指定，照 **DeepSeek Harness（dsh）** 的「设置 → 模型」重做；
 * 2026-10-16 按用户要求**删掉客户端直连**那条链路（连同 `src/api/**`），
 * 这一页现在只有一条链：服务商档案（服务端）。
 *
 * ── 调研结论（出处：github.com/deepseek-ai/deepseek-harness，MIT）──────────────
 *   · `docs/user/guide/providers.zh.md` —— 用户文档，「配置模型」那一章
 *   · `packages/llm/{llm,llm-pi-ai,llm-deepseek,llm-deepseek-api-key}/**` —— 适配器与凭据
 *   · `apps/web/**` 的模型设置页与 `apps/web/tests/models-settings.e2e.ts` —— 界面结构
 *
 *   dsh 把这件事拆成三层：
 *   1) **凭据与配置分离**：密钥只写，存 `$DSH_HOME/.credentials.yaml`，配置里只留**凭据引用**；
 *      页面永远只拿到脱敏描述符（我们的对应物 = 服务端只回 `api_key_hint`）。
 *   2) **提供商 = 协议 + 地址 + 凭据 + 模型目录**：内置提供商（deepseek / openai / anthropic /
 *      moonshotai / zai …）由「已安装目录」给端点与模型表；目录里没有的走**自定义模型 API**，
 *      字段只有 Provider ID（小写、永久）、显示名称、基础 URL、**API 协议三选一**
 *      （openai-completions / openai-responses / anthropic-messages）、凭据、至少一个模型。
 *      一个提供商只用一种协议；网关同时给两种就建两个提供商。
 *   3) **模型目录可探测**：点「获取可用模型」，用当前表单的地址/协议/密钥去问端点，
 *      返回可搜索、可勾选的选择框；探测失败就手动填模型 ID（**等效**，不是降级）。
 *   另外两条产品口径：选模型 = 设为新会话默认值（老会话保留自己日志里的模型）；
 *   默认值指向已删除的 provider 时，输入框显示「选择模型」并阻止输入。
 *
 * ── 我们怎么落（不新增后端概念）──────────────────────────────────────────────
 *   GET  /api/llm                        当前生效值（provider / model / base_url / key_set）
 *   POST /api/llm/test                   用当前生效配置真发一次探活
 *   POST /api/llm/models                 服务端代取端点上的模型列表（探测）
 *   GET/POST/DELETE /api/llm/profiles    **服务商档案** = dsh 的 provider 条目
 *                                        （name / format / model / base_url / api_key）
 *                                        另有高级项：reasoning_effort / thinking_type /
 *                                        max_tokens(+字段名) / streaming（见页面「高级（可选）」段）
 *   POST /api/llm/profiles/{id}/activate 激活（= dsh 的「设为默认模型」）
 *   GET  /api/llm/pool                   故障转移轮询链（+ reset）
 *
 *   与 dsh 的**已知差异**（诚实标注，不假装对齐）：
 *     · 我们的一个档案 = 一个模型（dsh 的一个 provider = 一张模型目录）⇒ 同一个网关要多个模型
 *       就建多个档案；探测出来的候选模型只能"选中一个"填进档案，而不是一次勾多个。
 *     · 没有 Provider ID 与显示名之分（服务端 id 自增，`name` 就是显示名，可改）。
 *     · 没有 per-model 的上下文窗口/输入模态编辑器；`context_window_k`、`rate_per_*`、`priority`、
 *       `pool_exclude`、`proxy`、`session_header_key` 由后端档案字段承载、页面暂不暴露
 *       （要暴露就按 dsh 的「模型选项」再加行）。
 *     · 凭据引用/环境变量后备（`apiKeyEnv`）没有 —— 服务端只在库里存密钥。
 *
 * 安全：密钥一律只写。服务端只回 `api_key_hint` 掩码，编辑时留空 = 不改动。
 */

/**
 * 提供商预设（dsh 内置目录里的几个 + 常用网关）。
 *
 * ⚠️ 地址取自各家公开文档的标准 Base URL；**模型 ID 只是预填建议** ——
 *    模型更新很快，旁边的「获取可用模型」才是准绳（dsh 同一口径：探测是便利手段而非保证）。
 */
const PROVIDER_PRESETS: { id: string; label: string; format: string; baseUrl: string; model: string }[] = [
  { id: "custom", label: "自定义（手填）", format: "", baseUrl: "", model: "" },
  {
    id: "deepseek",
    label: "DeepSeek（官方）",
    format: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    format: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    model: "",
  },
  {
    id: "anthropic",
    label: "Anthropic（Claude）",
    format: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "",
  },
  {
    id: "moonshotai",
    label: "Kimi / 月之暗面（moonshotai）",
    format: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
  },
  {
    id: "zai",
    label: "智谱 GLM（zai）",
    format: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.5",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    format: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "",
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    format: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "",
  },
];

/** dsh 的协议三选一 → 本工程 `format` 的取值（服务端已支持这三个值）。 */
const PROTOCOL_OPTIONS = [
  { value: "openai", label: "OpenAI Chat Completions", description: "/chat/completions（最通用）" },
  { value: "openai-responses", label: "OpenAI Responses", description: "/responses（新版 API）" },
  { value: "anthropic", label: "Anthropic Messages", description: "/v1/messages（Claude 协议）" },
];

function protocolLabel(format: string) {
  return PROTOCOL_OPTIONS.find((option) => option.value === format)?.label ?? format;
}

/** 一行摘要里用的短名（「OpenAI Chat Completions」在状态行里太长） */
const PROTOCOL_SHORT: Record<string, string> = {
  openai: "Chat Completions",
  "openai-responses": "Responses",
  anthropic: "Messages",
};

/**
 * 下面三组 = 「高级」区的选项。它们全是**服务端档案里真有的字段**
 * （见 db/config.go 的 LLMProfile 注释与 server/dto.go 的 LLMProfileDTO），
 * 不是照着直连配置抄的：空串一律表示"不发送该字段、由端点默认值决定"。
 *
 * 2026-10-16 收编：原来的「客户端直连 → 高级」里，能落到服务端档案的只有
 * 推理强度 / 输出上限 / 流式输出三项；temperature、自定义请求头、流式 usage、
 * 连接超时、系统提示词、关于你 在服务端没有对应字段（系统提示词属于 Agent 的
 * 提示词版本，不在这里），直连那条链路整块删掉。
 */
const REASONING_OPTIONS = [
  { value: "", label: "不发送（端点默认）" },
  { value: "low", label: "低（low）" },
  { value: "medium", label: "中（medium）" },
  { value: "high", label: "高（high）" },
  { value: "xhigh", label: "很高（xhigh）" },
  { value: "max", label: "最高（max）" },
];

/** 思考开关（thinking.type）：与推理强度解耦，官方与网关各认一半，所以两个都给 */
const THINKING_OPTIONS = [
  { value: "", label: "不发送（端点默认）" },
  { value: "enabled", label: "开启（enabled）" },
  { value: "disabled", label: "关闭（disabled）" },
];

/** 输出上限的请求字段名：只有 openai 协议用得上（anthropic / responses 各自定死了名字） */
const MAX_TOKENS_FIELD_OPTIONS = [
  { value: "", label: "max_tokens", description: "老字段，兼容面最广（默认）" },
  {
    value: "max_completion_tokens",
    label: "max_completion_tokens",
    description: "OpenAI 推理模型要求用这个名字",
  },
];

export function ModelApiPane({ section }: SettingsPaneProps) {
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);
  const [global, setGlobal] = useState<Record<string, unknown> | null>(null);
  const [pool, setPool] = useState<LLMPoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftFormat, setDraftFormat] = useState("openai");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftPreset, setDraftPreset] = useState("custom");
  const [formError, setFormError] = useState("");
  const [probing, setProbing] = useState(false);
  /** 探测回来的模型 id 列表（服务端代取，见下） */
  const [probedModels, setProbedModels] = useState<string[]>([]);
  const [probeNote, setProbeNote] = useState("");
  // 高级（可选）：服务端档案里会随每次请求发出去的几项，空 = 不发送
  const [draftReasoning, setDraftReasoning] = useState("");
  const [draftThinking, setDraftThinking] = useState("");
  const [draftMaxTokens, setDraftMaxTokens] = useState("");
  const [draftMaxTokensField, setDraftMaxTokensField] = useState("");
  const [draftStreaming, setDraftStreaming] = useState(true);

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
      setError(caught instanceof Error ? caught.message : "无法加载模型配置");
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
        result.ok ? `连接正常 · ${String(result.latency_ms ?? "?")} ms` : `失败：${result.error || "无响应"}`,
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
      window.dispatchEvent(new CustomEvent("artex:llm-changed"));
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
      window.dispatchEvent(new CustomEvent("artex:llm-changed"));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(null);
    }
  };

  const resetDraftProbe = () => {
    setDraftPreset("custom");
    setFormError("");
    setProbing(false);
    setProbedModels([]);
    setProbeNote("");
  };

  const openCreate = () => {
    setDraftId(null);
    setDraftName("");
    setDraftFormat("openai");
    setDraftModel("");
    setDraftBaseUrl("");
    setDraftKey("");
    setDraftReasoning("");
    setDraftThinking("");
    setDraftMaxTokens("");
    setDraftMaxTokensField("");
    setDraftStreaming(true);
    resetDraftProbe();
  };

  const openEdit = (profile: LLMProfile) => {
    setDraftId(Number(profile.id));
    setDraftName(profile.name);
    setDraftFormat(profile.format);
    setDraftModel(profile.model);
    setDraftBaseUrl(profile.base_url ?? "");
    setDraftKey("");
    setDraftReasoning(profile.reasoning_effort ?? "");
    setDraftThinking(profile.thinking_type ?? "");
    setDraftMaxTokens(profile.max_tokens ? String(profile.max_tokens) : "");
    setDraftMaxTokensField(profile.max_tokens_field ?? "");
    setDraftStreaming(profile.streaming !== false);
    resetDraftProbe();
  };

  const applyPreset = (presetId: string) => {
    setDraftPreset(presetId);
    const preset = PROVIDER_PRESETS.find((item) => item.id === presetId);
    if (!preset || preset.id === "custom") return;
    setDraftName((current) => current.trim() || preset.label);
    setDraftFormat(preset.format || "openai");
    setDraftBaseUrl(preset.baseUrl);
    if (preset.model && !draftModel.trim()) setDraftModel(preset.model);
  };

  /**
   * 「获取可用模型」—— 交给**服务端**代取（`POST /api/llm/models`，见 server_mgmt.go 的 pgListModels）。
   *
   * ★ 2026-10-16：原来这一步由浏览器自己打端点（`@/api` 的 listModels），换过来有三个好处：
   *   ① 与真实调用同一条网路（服务端还可能带出站代理），探测结果跟实际能不能用一致；
   *   ② 编辑已保存的服务商时**密钥可以留空** —— 服务端用档案里存的那把；
   *   ③ anthropic 协议也支持了：服务端会先试 `GET /v1/models`，再退回 OpenAI 路径各试一次。
   * 失败仍然只是"探测失败"：直接手填模型 ID，效果一样（dsh 同口径）。
   */
  const probeModels = async () => {
    setProbing(true);
    setProbeNote("");
    setProbedModels([]);
    try {
      const result = await artexApi.fetchLLMModels(
        draftFormat,
        draftBaseUrl.trim(),
        draftKey.trim(),
        "",
        draftId ?? undefined,
      );
      const models = result.models ?? [];
      if (result.ok && models.length > 0) {
        setProbedModels(models);
        setProbeNote(`端点返回 ${String(models.length)} 个模型，点一个填进「模型」`);
      } else {
        setProbeNote(result.error ?? "端点没有返回模型列表：手动填模型 ID 即可（与探测等效，dsh 同口径）。");
      }
    } catch (caught) {
      setProbeNote(caught instanceof Error ? caught.message : "探测失败");
    } finally {
      setProbing(false);
    }
  };

  /**
   * 清空 / 退出编辑。
   *
   * ★ 2026-10-15 PM 复核（用户：「我不希望添加提供商还得点一下」）：表单**常驻页面**，
   *   不再有「展开 / 收起」这回事 —— 这个函数只剩「把草稿清回新建档」的语义。
   */
  const resetForm = () => {
    openCreate();
    setFormError("");
  };

  const saveProfile = async () => {
    if (!draftName.trim() || !draftModel.trim()) {
      setFormError("显示名称与模型必填。");
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
        // 高级（可选）——全部是服务端档案字段；空串/0 都表示"不发送该字段"。
        // max_tokens_field 只对 openai 协议有意义（服务端同口径，会自行清空其它协议的值）。
        reasoning_effort: draftReasoning,
        thinking_type: draftThinking,
        max_tokens: Number(draftMaxTokens.trim()) || 0,
        max_tokens_field: draftFormat === "openai" ? draftMaxTokensField : "",
        streaming: draftStreaming,
      });
      resetForm();
      window.dispatchEvent(new CustomEvent("artex:llm-changed"));
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const active = profiles.find((profile) => profile.is_default);
  const configured = global?.configured === true;
  const format = active?.format ?? text("provider");
  const effectiveModel = text("model") || active?.model || "";
  /**
   * 「当前生效」压成一行摘要（2026-10-15 PM 复核：原来摊成 协议 / 模型 / 地址 / Key 四行，
   * 与服务商列表里的激活项逐字重复）。信息源不变（GET /api/llm），只是挪进「服务商」的
   * 分区标题行；Key 状态仍只报"是否"，不回显。
   */
  const summary =
    profiles.length === 0
      ? "尚未添加服务商：Agent 会退回规则模式，模型相关功能不可用。"
      : configured
        ? [
            `${String(profiles.length)} 个服务商`,
            `当前生效 ${active?.name ?? "全局配置"}`,
            format ? (PROTOCOL_SHORT[format] ?? format) : "",
            effectiveModel,
            global?.key_set === true ? "Key 已配置" : "Key 未配置",
          ]
            .filter(Boolean)
            .join(" · ")
        : `${String(profiles.length)} 个服务商 · 未激活：Agent 会退回规则模式`;

  return (
    <PaneShell
      lede="服务商与故障转移池：Focus 服务端用它跑任务与会话。密钥只写、不回显。"
      section={section}
      title="模型与 API"
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

      {/* ── 添加 / 编辑服务商：**常驻**、且排在列表**上面** ─────────────────────────
          用户口径（2026-10-15，PM 复核三条一起落在这一段）：
            · 「不要弹出窗口来设置新 api，而是设置页面原生样式」→ 用设置页原生分区/卡片/行；
            · 「我不希望添加提供商还得点一下」→ 表单常驻页面（`formOpen` 已删，无展开动作）；
            · 「表单会随服务商变多而下移」→ 本节排在「服务商」列表**之前**（表单在上、列表在下）。
          点列表某一行的「编辑」→ 同一个表单切到编辑态（标题变「编辑服务商」+ 取消编辑）；
          保存成功后回到新建态，可继续加下一个。 */}
      <PaneSection
        description={
          draftId != null
            ? "API Key 留空表示不改动已保存的密钥；其余字段保存后立即生效。"
            : "选一个预设，或手填协议 / 地址 / Key / 模型。密钥只写、不回显。"
        }
        title={draftId != null ? "编辑服务商" : "添加服务商"}
      >
        <PaneCard>
          {draftId == null ? (
            <PaneRow
              control={
                <PaneSelect
                  ariaLabel="提供商预设"
                  onChange={applyPreset}
                  options={PROVIDER_PRESETS.map((preset) => ({
                    value: preset.id,
                    label: preset.label,
                    description: preset.baseUrl || "自己填地址与协议",
                  }))}
                  value={draftPreset}
                />
              }
              description="选中会自动填好协议、地址与建议模型（模型可改）"
              label="提供商预设"
            />
          ) : null}
          <PaneInputRow
            ariaLabel="显示名称"
            description="在服务商列表与任务里显示的名字"
            label="显示名称"
            onChange={setDraftName}
            placeholder="例如：DeepSeek 官方"
            value={draftName}
            width={240}
          />
          <PaneRow
            control={
              <PaneSelect
                ariaLabel="API 协议"
                onChange={setDraftFormat}
                options={PROTOCOL_OPTIONS}
                value={draftFormat}
              />
            }
            description="一个提供商只用一种协议；网关同时给两种就建两个"
            label="API 协议"
          />
          <PaneInputRow
            ariaLabel="API 地址"
            description="兼容端点；留空走官方地址"
            label="API 地址"
            onChange={setDraftBaseUrl}
            placeholder="https://api.deepseek.com/v1"
            value={draftBaseUrl}
            width={320}
          />
          <PaneRow
            control={<SettingsSecretInput label="API Key" onChange={setDraftKey} value={draftKey} />}
            description={draftId != null ? "留空 = 不改动已保存的密钥" : "只写、不回显；服务端只回掩码"}
            label="API Key"
          />
          <PaneRow
            control={
              <span className="cx-pane__row-actions">
                <Input
                  aria-label="模型"
                  onChange={(event) => setDraftModel(event.target.value)}
                  placeholder="deepseek-chat"
                  size="sm"
                  value={draftModel}
                />
                <Button
                  color="secondary"
                  disabled={probing}
                  onClick={() => void probeModels()}
                  size="sm"
                  title={
                    draftId != null
                      ? "服务端用当前地址 + 已存密钥（Key 留空也算）读一次模型列表"
                      : "服务端用当前地址与 Key 读一次模型列表（新建时需先填 Key）"
                  }
                  variant="soft"
                >
                  {probing ? "探测中…" : "获取可用模型"}
                </Button>
              </span>
            }
            description="服务端代取（POST /api/llm/models）；端点不给列表时手填模型 ID，效果一样"
            label="模型"
          />
        </PaneCard>
        {probeNote ? <p className="cx-pane__section-description">{probeNote}</p> : null}
        {probedModels.length > 0 ? (
          <div aria-label="可用模型" className="cx-model-probe" role="listbox">
            {probedModels.slice(0, 60).map((model) => (
              <button
                className="cx-model-probe__item"
                key={model}
                onClick={() => setDraftModel(model)}
                type="button"
              >
                {model}
              </button>
            ))}
          </div>
        ) : null}
      </PaneSection>

      {/*
        高级（可选）——**单独分段**（2026-10-16 用户：「这个高级怎么能放在这个位置呢，应该和之前的高级
        一样单独分段」）。内容 = 从「客户端直连 → 高级」里收编的三项 + 一个同族的字段名开关，
        全部是服务端档案里真有的列（db/config.go 的 LLMProfile），保存后随每次请求发出去：
          推理强度 reasoning_effort · 思考开关 thinking_type · 输出上限 max_tokens(+字段名) · 收发模式 streaming
        收编不进来的（服务端没有对应字段，故不搬）：temperature / 流式 usage / 自定义请求头 /
        连接超时 / 系统提示词（属于 Agent 的提示词版本，见 Agent 页）/ 关于你。
      */}
      <PaneSection
        description="可选项：留空 = 用端点默认值。它们和上面的基础项属于同一份档案，随每次请求发出去。"
        title="高级（可选）"
      >
        <PaneCard>
          <PaneRow
            control={
              <PaneSelect
                ariaLabel="推理强度"
                onChange={setDraftReasoning}
                options={REASONING_OPTIONS}
                value={draftReasoning}
              />
            }
            description="请求体的 reasoning_effort：思考花多少算力（端点不支持时会报 400）"
            label="推理强度"
          />
          <PaneRow
            control={
              <PaneSelect
                ariaLabel="思考开关"
                onChange={setDraftThinking}
                options={THINKING_OPTIONS}
                value={draftThinking}
              />
            }
            description="请求体的 thinking.type：与「推理强度」解耦，一个管开关、一个管力度"
            label="思考开关"
          />
          <PaneInputRow
            ariaLabel="输出上限"
            description="单次回复的 token 上限，0 或留空 = 不发送、由端点默认值决定"
            label="输出上限"
            onChange={setDraftMaxTokens}
            placeholder="0 = 不限制"
            suffix={<span className="cx-pane__row-description">tokens</span>}
            value={draftMaxTokens}
            width={160}
          />
          {draftFormat === "openai" ? (
            <PaneRow
              control={
                <PaneSelect
                  ariaLabel="输出上限字段名"
                  onChange={setDraftMaxTokensField}
                  options={MAX_TOKENS_FIELD_OPTIONS}
                  value={draftMaxTokensField}
                />
              }
              description="上限用哪个请求字段名（仅 OpenAI 协议；Anthropic / Responses 各自定死了名字）"
              label="上限字段名"
            />
          ) : null}
          <PaneRow
            control={<PaneSwitch checked={draftStreaming} label="流式输出" onChange={setDraftStreaming} />}
            description="开 = SSE 流式（能看到实时进度）；关 = 非流式整段返回，网关的 SSE 不稳时用它兜底"
            label="流式输出"
          />
        </PaneCard>
      </PaneSection>

      {/* 保存：整份档案（基础项 + 高级项）在这里落库 —— 与「同步」页同一套写法：末段一行「保存」 */}
      <PaneSection
        description="写入服务端配置档案（POST /api/llm/profiles）：基础项与高级项一起保存。"
        title="保存"
      >
        <PaneCard>
          <PaneRow
            control={
              <span className="cx-pane__row-actions">
                {/* 编辑态：「取消编辑」回到新建；新建态：「清空」把草稿擦干净。 */}
                <Button color="secondary" onClick={resetForm} size="sm" variant="ghost">
                  {draftId != null ? "取消编辑" : "清空"}
                </Button>
                <Button
                  color="primary"
                  disabled={busy === "save"}
                  onClick={() => void saveProfile()}
                  size="sm"
                  variant="solid"
                >
                  {busy === "save" ? "保存中…" : draftId != null ? "保存修改" : "添加"}
                </Button>
              </span>
            }
            description={formError ? formError : "新建 = 「添加」；从列表点「编辑」进来 = 「保存修改」"}
            label="服务商档案"
          />
        </PaneCard>
      </PaneSection>

      {/* ── 服务商列表：标题行就是「当前生效」摘要（原来的四行卡已折叠进这一行）─────
          摘要的来源仍是 GET /api/llm；「测试连接」也从那张卡挪到分区标题行。 */}
      <PaneSection
        actions={
          <Button
            color="secondary"
            disabled={busy === "test" || !configured}
            onClick={() => void runTest()}
            size="sm"
            title="用服务端当前生效配置真发一次探活请求（POST /api/llm/test）"
            variant="soft"
          >
            {busy === "test" ? "测试中…" : "测试连接"}
          </Button>
        }
        description={summary}
        title="服务商"
      >
        <PaneCard>
          {loading && profiles.length === 0 ? (
            <PaneEmpty description="正在读取服务端的模型配置档案。" title="正在加载…" />
          ) : profiles.length === 0 ? (
            <PaneEmpty
              description="在上面那张卡里选预设或手填 协议 / 地址 / Key / 模型 —— 保存后就会出现在这里。"
              title="暂无服务商"
            />
          ) : (
            profiles.map((profile) => (
              <PaneRow
                description={
                  <span>
                    {protocolLabel(profile.format)} · <code>{profile.model}</code>
                    {profile.base_url ? ` · ${profile.base_url}` : ""}
                    {profile.api_key_hint ? ` · Key ${profile.api_key_hint}` : " · 未配置 Key"}
                    {profile.pool_exclude ? " · 不参与池" : ""}
                    {/* 高级区里非默认的那几项就地标出来（默认值不占版面） */}
                    {profile.streaming === false ? " · 非流式" : ""}
                    {profile.max_tokens ? ` · 上限 ${String(profile.max_tokens)}` : ""}
                    {profile.reasoning_effort ? ` · 思考 ${profile.reasoning_effort}` : ""}
                  </span>
                }
                key={profile.id}
                label={
                  <span className="cx-pane__row-label">
                    {profile.name}
                    {profile.is_default ? <span className="cx-pane__tag">当前</span> : null}
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
                      设为默认
                    </Button>
                    <Button color="secondary" onClick={() => openEdit(profile)} size="sm" variant="ghost">
                      编辑
                    </Button>
                    <PaneConfirmAction
                      confirmLabel="删除"
                      danger
                      description="删除后引用它的任务会回落到全局配置或激活档案。"
                      onConfirm={() => void remove(profile)}
                      title={`删除服务商「${profile.name}」？`}
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
        {testResult ? <p className="cx-pane__section-description">{testResult}</p> : null}
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
                label={`#${String(member.profile_id)}`}
              />
            ))
          )}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
