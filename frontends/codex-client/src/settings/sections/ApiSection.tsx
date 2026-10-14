import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  API_CONFIG_FIELDS,
  type ApiConfigField,
  type ConnectionTestResult,
  createApiClient,
  type ModelListResult,
  type ResolvedApiConfig,
  resetApiConfig,
  updateApiConfig,
  useApiConfig,
  validateApiConfig,
} from "@/api";
import { SettingsSecretInput } from "@/settings/controls";
import {
  PaneBanner,
  PaneCard,
  PaneInputRow,
  PaneRow,
  PaneSection,
  PaneSelect,
  PaneShell,
  PaneSwitch,
  PaneTextBlock,
} from "@/settings/panes/pane-kit";
import { Button, Input } from "@/ui";

/**
 * 自定义 API —— **本还原工程新增页**（官方设置面没有这个分区）。
 *
 * 呈现改用**原生设置 pane 套件**（PaneShell/PaneSection/PaneCard/PaneRow），与其它原生设置页
 * （环境 / Git / 钩子 …）同一套行几何；不再使用旧的 SettingsCard 组件族。
 *
 * 它是一条**真链路**，不是展示页：
 *   读   useApiConfig()      —— @/api/config 的模块级 store（localStorage: codex.api）
 *   写   updateApiConfig()   —— 保存草稿（含请求头整体替换）
 *   校验 validateApiConfig() —— baseUrl / model / apiKey 的前端拦截，顶部横幅汇总显示
 *   打点 createApiClient(draft).testConnection() —— 先 GET /models，不通再退一步 1 token 对话探活
 *   拉模型 createApiClient(draft).listModels() —— 成功后点模型芯片即可写回 model 字段
 * 隐私：全部字段只写本机 localStorage（key = codex.api），除了你自己填的端点以外不发往任何地方。
 */

function describeTest(result: ConnectionTestResult): {
  tone: "success" | "danger";
  title: string;
  detail: string;
} {
  if (result.ok) {
    const models =
      result.mode === "models" ? `${result.models.length} 个模型` : "对话端点可用（/models 不可用）";
    return {
      tone: "success",
      title: result.mode === "models" ? "连接成功 · /models 可用" : "连接成功 · 仅对话端点",
      detail: `耗时 ${result.latencyMs} ms · ${models}`,
    };
  }
  return {
    tone: "danger",
    title: `连接失败 · ${result.error?.kind ?? "unknown"}`,
    detail: `${result.error?.message ?? "未知错误"}（耗时 ${result.latencyMs} ms）`,
  };
}

/** 自定义请求头编辑器（pairs 顺序保持用户输入顺序；key 为空的行直接丢弃） */
function HeaderEditor({
  headers,
  onChange,
}: {
  headers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(headers);
  const rewrite = (index: number, key: string, value: string) => {
    const next: [string, string][] = entries.map((entry, i) => (i === index ? [key, value] : entry));
    onChange(Object.fromEntries(next.filter(([name]) => name.trim() !== "")));
  };
  return (
    <div className="cx-pane__header-editor">
      {entries.length === 0 ? <p className="cx-pane__row-description">还没有自定义请求头。</p> : null}
      {entries.map(([key, value], index) => (
        <div className="cx-pane__header-row" key={index}>
          <Input
            aria-label="请求头名称"
            onChange={(event) => rewrite(index, event.target.value, value)}
            placeholder="api-key"
            size="sm"
            value={key}
          />
          <Input
            aria-label="请求头取值"
            onChange={(event) => rewrite(index, key, event.target.value)}
            placeholder="取值"
            size="sm"
            value={value}
          />
          <Button
            color="secondary"
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
            size="sm"
            variant="ghost"
          >
            删除
          </Button>
        </div>
      ))}
      <Button color="secondary" onClick={() => onChange({ ...headers, "": "" })} size="sm" variant="soft">
        添加请求头
      </Button>
    </div>
  );
}

export function ApiSection() {
  const navigate = useNavigate();
  const stored = useApiConfig();
  const [draft, setDraft] = useState<ResolvedApiConfig>(stored);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<ModelListResult | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  // store 变了（保存 / 重置 / 其它标签页）就同步草稿
  useEffect(() => setDraft(stored), [stored]);

  const issues = validateApiConfig(draft);
  const issueFor = (key: keyof ResolvedApiConfig, level: "error" | "warn") =>
    issues.find((issue) => issue.field === key && issue.level === level)?.message;
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  const patch = (next: Partial<ResolvedApiConfig>) => setDraft((prev) => ({ ...prev, ...next }));

  const runTest = async () => {
    setTesting(true);
    try {
      // 用**草稿**打，不用已保存的配置：填完就能试，不用先保存
      const result = await createApiClient(draft).testConnection();
      setTest(result);
    } finally {
      setTesting(false);
    }
  };

  const runListModels = async () => {
    setLoadingModels(true);
    try {
      const result = await createApiClient(draft).listModels();
      setModels(result);
      // 拉到了就顺手更新测试结论的模型数，两处显示不打架
      setTest((prev) =>
        prev?.ok && result.ok ? { ...prev, models: result.models, latencyMs: result.latencyMs } : prev,
      );
    } finally {
      setLoadingModels(false);
    }
  };

  const renderField = (field: ApiConfigField) => {
    const value = draft[field.key];
    const error = issueFor(field.key, "error");
    const warn = issueFor(field.key, "warn");
    const description = [field.help, error ? `错误：${error}` : warn ? `提示：${warn}` : null]
      .filter(Boolean)
      .join(" · ");

    switch (field.kind) {
      case "password":
        return (
          <PaneRow
            control={
              <SettingsSecretInput
                label={field.label}
                onChange={(next) => patch({ apiKey: next })}
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
              />
            }
            description={description}
            key={field.key}
            label={field.label}
          />
        );
      case "textarea":
        return (
          <PaneTextBlock
            ariaLabel={field.label}
            description={description}
            key={field.key}
            label={field.label}
            onChange={(next) => patch({ [field.key]: next } as Partial<ResolvedApiConfig>)}
            placeholder={field.placeholder}
            rows={4}
            value={typeof value === "string" ? value : ""}
          />
        );
      case "switch":
        return (
          <PaneRow
            control={
              <PaneSwitch
                checked={Boolean(value)}
                label={field.label}
                onChange={(checked) => patch({ [field.key]: checked } as Partial<ResolvedApiConfig>)}
              />
            }
            description={description}
            key={field.key}
            label={field.label}
          />
        );
      case "headers":
        return (
          <PaneRow
            control={<HeaderEditor headers={draft.headers} onChange={(next) => patch({ headers: next })} />}
            description={description}
            key={field.key}
            label={field.label}
          />
        );
      case "select":
        return (
          <PaneRow
            control={
              <PaneSelect
                ariaLabel={field.label}
                onChange={(next) => patch({ [field.key]: next } as Partial<ResolvedApiConfig>)}
                options={field.options ?? []}
                value={typeof value === "string" ? value : ""}
              />
            }
            description={description}
            key={field.key}
            label={field.label}
          />
        );
      case "number":
        return (
          <PaneInputRow
            ariaLabel={field.label}
            description={description}
            key={field.key}
            label={field.label}
            onChange={(raw) => {
              // 留空 = 完全不发送该字段（temperature / maxTokens），或回落默认值（两个超时）
              const trimmed = raw.trim();
              const numeric = trimmed === "" ? null : Number(trimmed);
              if (numeric !== null && !Number.isFinite(numeric)) return;
              patch(
                field.key === "timeoutMs" || field.key === "idleTimeoutMs"
                  ? ({ [field.key]: numeric ?? 0 } as Partial<ResolvedApiConfig>)
                  : ({ [field.key]: numeric } as Partial<ResolvedApiConfig>),
              );
            }}
            placeholder={field.placeholder}
            value={value === null || value === undefined ? "" : String(value)}
            width={220}
          />
        );
      default:
        return (
          <PaneInputRow
            ariaLabel={field.label}
            description={description}
            key={field.key}
            label={field.label}
            onChange={(next) => patch({ [field.key]: next } as Partial<ResolvedApiConfig>)}
            placeholder={field.placeholder}
            value={typeof value === "string" ? value : ""}
            width={320}
          />
        );
    }
  };

  const basicFields = API_CONFIG_FIELDS.filter((field) => !field.advanced);
  const advancedFields = API_CONFIG_FIELDS.filter((field) => field.advanced);
  const errors = issues.filter((issue) => issue.level === "error");
  const warns = issues.filter((issue) => issue.level === "warn");

  return (
    <PaneShell
      lede="仅写入本机 localStorage（codex.api）；除你填写的端点外不发任何请求。"
      section="api"
      title="自定义 API"
    >
      {errors.length > 0 ? (
        <PaneSection>
          <PaneBanner
            description={errors.map((issue) => issue.message).join("；")}
            title={`${errors.length} 项错误`}
            tone="danger"
          />
        </PaneSection>
      ) : warns.length > 0 ? (
        <PaneSection>
          <PaneBanner
            description={warns.map((issue) => issue.message).join("；")}
            title={`${warns.length} 项提示`}
            tone="warning"
          />
        </PaneSection>
      ) : null}

      <PaneSection title="连接">
        <PaneCard>{basicFields.map(renderField)}</PaneCard>
      </PaneSection>

      <PaneSection description="工程自定字段（@/api/config.ts 的 API_CONFIG_FIELDS）" title="高级">
        <PaneCard>{advancedFields.map(renderField)}</PaneCard>
      </PaneSection>

      {/*
        「智能体默认」= 官方「配置」页 + 「个性化」页里本工程**能承接**的部分（用户 2026-10-15 指定合并）：
          · 推理强度（reasoning_effort）—— 真实写进请求体，见 @/api/client.ts
          · 系统提示词 / 关于你 —— 上面「高级」区里的两行就是个性化页的自定义指令
        官方那页的其余档位（审批策略 / 沙盒 / 网络访问）在本客户端**没有执行侧**：
        这里只发 HTTP 请求，不落本机执行，所以不搬过来假装；真正生效的批准策略在 ARTEX 侧。
      */}
      <PaneSection
        description="官方「配置 / 个性化」两页里可用的一部分；其余档位在本客户端没有执行侧（见下）"
        title="智能体默认"
      >
        <PaneCard>
          <PaneRow
            control={
              <Button
                color="secondary"
                onClick={() => navigate("/settings/approvals")}
                size="sm"
                variant="soft"
              >
                打开审批与拦截
              </Button>
            }
            description="审批策略 / 沙盒 / 网络访问：本客户端只发 HTTP 请求、不落本机执行，所以这些档位搬过来也不会生效。ARTEX 侧真正的审批在「审批」页与节点拦截规则里。"
            label="批准策略与沙盒"
          />
        </PaneCard>
      </PaneSection>

      <PaneSection title="测试与模型">
        <PaneCard>
          <PaneRow
            control={
              <Button
                color="secondary"
                disabled={testing}
                onClick={() => void runTest()}
                size="sm"
                variant="soft"
              >
                {testing ? "测试中…" : "测试连接"}
              </Button>
            }
            description="先 GET /models；不支持 /models 的兼容服务会退一步做一次 1 token 的对话探活"
            label="测试连接"
          />
          <PaneRow
            control={
              <Button
                color="secondary"
                disabled={loadingModels}
                onClick={() => void runListModels()}
                size="sm"
                variant="soft"
              >
                {loadingModels ? "拉取中…" : "拉取模型列表"}
              </Button>
            }
            description="成功后下面会列出模型，点一个即可写回「模型」字段"
            label="模型列表"
          />
        </PaneCard>
        {test ? (
          <PaneBanner
            description={describeTest(test).detail}
            title={describeTest(test).title}
            tone={describeTest(test).tone}
          />
        ) : null}
        {models ? (
          models.ok ? (
            <PaneCard>
              <PaneRow
                control={null}
                description={`拉到 ${models.models.length} 个模型（耗时 ${models.latencyMs} ms）。点一个写入「模型」字段。`}
                label="可用模型"
              />
              <div className="cx-pane__chips cx-pane__chips--pad">
                {models.models.map((model) => (
                  <button
                    className="cx-pane__chip cx-pane__chip--action"
                    data-selected={draft.model === model.id ? "" : undefined}
                    key={model.id}
                    onClick={() => patch({ model: model.id })}
                    type="button"
                  >
                    {model.id}
                  </button>
                ))}
              </div>
            </PaneCard>
          ) : (
            <PaneBanner
              description={`${models.error?.message ?? "未知错误"}（耗时 ${models.latencyMs} ms）`}
              title={`拉取失败 · ${models.error?.kind ?? "unknown"}`}
              tone="danger"
            />
          )
        ) : null}
      </PaneSection>

      <PaneSection title="保存">
        <PaneCard>
          <PaneRow
            control={
              <>
                <Button
                  disabled={!dirty}
                  onClick={() => updateApiConfig(draft)}
                  size="sm"
                  variant="soft"
                  color="secondary"
                >
                  保存
                </Button>
                <Button
                  color="secondary"
                  onClick={() => {
                    resetApiConfig();
                    setTest(null);
                    setModels(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  清空
                </Button>
              </>
            }
            description="保存写 localStorage（codex.api）；清空恢复默认空配置。草稿未保存时「测试连接」用的仍是草稿。"
            label="保存配置"
          />
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
