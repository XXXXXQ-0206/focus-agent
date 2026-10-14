import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SettingsSecretInput } from "@/settings/controls";
import type { SettingsPaneProps } from "@/settings/panes";
import {
  PaneBanner,
  PaneCard,
  PaneInputRow,
  PaneRow,
  PaneSection,
  PaneSelect,
  PaneShell,
  PaneSwitch,
} from "@/settings/panes/pane-kit";
import { Button, Input } from "@/ui";
import { type ArtexSystemSettings, artexApi } from "./api";
import "./system-settings.css";

/**
 * ARTEX 服务端设置的分区页（原生设置骨架）。
 *
 * 骨架与其它原生设置页完全一致（见 src/settings/panes/environment.tsx）：
 *   PaneShell（h1 由 SettingsPage 的标题带渲染，这里只出内容列）
 *     → PaneSection（分组标题）→ PaneCard（行 + 发丝分隔线）→ PaneRow/PaneInputRow。
 * 分区的左栏导航来自 src/settings/nav-model.ts 的「ARTEX（服务端）」组，
 * 路由是 /settings/connections（连接与流量）、/settings/artex-agents、/settings/artex-search。
 * 数据一律读写 ARTEX 服务端 /api/settings；本页不模拟保存。
 *
 * ⚠️ 2026-10-15：原「流量与证据」（artex-traffic）与「上游连接」（artex-connections）两页
 * **合并进「连接与流量」**（src/settings/panes/connections.tsx，用户提议：这三页是同一条链路）。
 * 这两个组件因此删除；共享的取数/保存/反馈三件套（useArtexSettings / Feedback / ReloadButton）
 * 改为 export，供那个合并页复用。
 */

const SEARCH_BACKENDS = [
  { value: "ddgs", label: "DuckDuckGo" },
  { value: "brave-free", label: "Brave" },
  { value: "tavily", label: "Tavily" },
  { value: "deepseek", label: "DeepSeek" },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

/** 服务端设置读取/保存的公共状态（四个分区各自实例化一份，互不共享草稿）。 */
export function useArtexSettings() {
  const [settings, setSettings] = useState<ArtexSystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSettings(await artexApi.systemSettings());
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (
      patch: Partial<ArtexSystemSettings> & Record<string, unknown>,
      success = "已保存",
    ): Promise<boolean> => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        setSettings(await artexApi.saveSystemSettings(patch));
        setNotice(success);
        return true;
      } catch (caught) {
        setError(errorText(caught));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /** 本地校验失败等不进服务端的提示。 */
  const fail = useCallback((message: string) => {
    setNotice("");
    setError(message);
  }, []);

  return { settings, loading, saving, error, notice, load, save, fail };
}

export function Feedback({ error, loading, notice }: { error: string; loading: boolean; notice: string }) {
  if (!error && !notice && !loading) return null;
  return (
    <PaneSection>
      {error ? <PaneBanner description={error} title="操作失败" tone="danger" /> : null}
      {notice ? <PaneBanner title={notice} tone="success" /> : null}
      {loading ? <PaneBanner title="正在读取服务端设置…" /> : null}
    </PaneSection>
  );
}

export function ReloadButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      aria-label="重新加载系统设置"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      uniform
      variant="ghost"
    >
      <RefreshCw aria-hidden size={14} />
    </Button>
  );
}

/** Agent 运行（/settings/artex-agents）。 */
export function ArtexAgentsSettingsPane({ section }: SettingsPaneProps) {
  const { settings, loading, saving, error, notice, load, save, fail } = useArtexSettings();
  const [workers, setWorkers] = useState("3");
  const [taskLimit, setTaskLimit] = useState("5");
  const unavailable = loading || saving || !settings;

  useEffect(() => {
    if (!settings) return;
    setWorkers(String(settings.workers ?? 3));
    setTaskLimit(String(settings.task_concurrency_limit ?? 5));
  }, [settings]);

  const toggle = (field: keyof ArtexSystemSettings, value: boolean, label: string) => {
    void save({ [field]: value }, `${label}已${value ? "开启" : "关闭"}`);
  };

  const saveNumber = (field: "workers" | "task_concurrency_limit", value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      fail("请输入大于 0 的整数。");
      return;
    }
    void save({ [field]: parsed }, "并发配置已保存");
  };

  return (
    <PaneShell
      actions={<ReloadButton disabled={loading || saving} onClick={() => void load()} />}
      lede="约束注入、并发上限与 LLM 轮询故障转移。"
      section={section}
      title="Agent 运行"
    >
      <Feedback error={error} loading={loading && !settings} notice={notice} />
      <PaneSection title="约束注入">
        <PaneCard>
          <PaneRow
            control={
              <PaneSwitch
                checked={settings?.constraints_inject_planner !== false}
                disabled={unavailable}
                label="约束注入到规划者"
                onChange={(value) => toggle("constraints_inject_planner", value, "规划者约束注入")}
              />
            }
            description="把任务的允许/禁止约束注入 planner 提示词。"
            label="约束注入到规划者"
          />
          <PaneRow
            control={
              <PaneSwitch
                checked={settings?.constraints_inject_worker !== false}
                disabled={unavailable}
                label="约束注入到执行者"
                onChange={(value) => toggle("constraints_inject_worker", value, "执行者约束注入")}
              />
            }
            description="把任务的允许/禁止约束注入 worker 提示词。"
            label="约束注入到执行者"
          />
        </PaneCard>
      </PaneSection>
      <PaneSection title="并发">
        <PaneCard>
          <PaneRow
            control={
              <span className="cx-pane__input-group">
                <Input
                  aria-label="工作 Agent 数量"
                  className="cx-pane__input cx-pane__input--w160"
                  disabled={unavailable}
                  min={1}
                  onChange={(event) => setWorkers(event.target.value)}
                  size="sm"
                  type="number"
                  value={workers}
                />
                <Button
                  color="secondary"
                  disabled={unavailable}
                  onClick={() => saveNumber("workers", workers)}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              </span>
            }
            description="每个任务同时运行的工作 Agent 数量；对之后启动的任务生效。"
            label="工作并发"
          />
          <PaneRow
            control={
              <PaneSwitch
                checked={settings?.task_concurrency_enabled ?? false}
                disabled={unavailable}
                label="启用任务并发上限"
                onChange={(value) => toggle("task_concurrency_enabled", value, "任务并发上限")}
              />
            }
            description="关闭时不限制同时运行的任务数；启用后超限任务会排队。"
            label="任务并发上限"
          />
          {settings?.task_concurrency_enabled ? (
            <PaneInputRow
              ariaLabel="任务并发上限数量"
              description="超过上限的新任务将进入队列。"
              label="同时运行的任务数"
              onChange={setTaskLimit}
              suffix={
                <Button
                  color="secondary"
                  disabled={unavailable}
                  onClick={() => saveNumber("task_concurrency_limit", taskLimit)}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              }
              value={taskLimit}
              width={220}
            />
          ) : null}
        </PaneCard>
      </PaneSection>
      <PaneSection title="LLM 故障转移">
        <PaneCard>
          <PaneRow
            control={
              <PaneSwitch
                checked={settings?.llm_pool_enabled ?? false}
                disabled={unavailable}
                label="启用 LLM 轮询故障转移"
                onChange={(value) => toggle("llm_pool_enabled", value, "LLM 故障转移")}
              />
            }
            description="当前模型不可用时自动尝试轮询链中的后续配置。"
            label="LLM 故障转移"
          />
          {settings?.llm_pool_enabled ? (
            <PaneRow
              control={
                <PaneSwitch
                  checked={settings.llm_pool_bind_fallback ?? false}
                  disabled={unavailable}
                  label="指定模型失败时回落"
                  onChange={(value) => toggle("llm_pool_bind_fallback", value, "指定模型故障回落")}
                />
              }
              description="允许显式绑定模型失败时也切到轮询链。"
              label="指定模型失败时回落"
            />
          ) : null}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}

/** 网络搜索（/settings/artex-search）。 */
export function ArtexSearchPane({ section }: SettingsPaneProps) {
  const { settings, loading, saving, error, notice, load, save } = useArtexSettings();
  const [searchProxy, setSearchProxy] = useState("");
  const [braveKey, setBraveKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [searchTest, setSearchTest] = useState("");
  const unavailable = loading || saving || !settings;

  useEffect(() => {
    if (!settings) return;
    setSearchProxy(settings.web_search_proxy ?? "");
  }, [settings]);

  const runSearchTest = async () => {
    if (!settings) return;
    try {
      const result = await artexApi.testWebSearch({
        web_search_backend: settings.web_search_backend,
        web_search_proxy: searchProxy.trim(),
        brave_search_api_key: braveKey,
        tavily_search_api_key: tavilyKey,
      });
      setSearchTest(
        result.ok
          ? `${result.backend ?? settings.web_search_backend} 测试成功，返回 ${String(result.count ?? 0)} 条结果。`
          : result.error || "搜索测试失败。",
      );
      setBraveKey("");
      setTavilyKey("");
    } catch (caught) {
      setSearchTest(errorText(caught));
    }
  };

  return (
    <PaneShell
      actions={<ReloadButton disabled={loading || saving} onClick={() => void load()} />}
      lede="服务端使用的搜索 provider、访问代理与 API Key。"
      section={section}
      title="网络搜索"
    >
      <Feedback error={error} loading={loading && !settings} notice={notice} />
      <PaneSection title="搜索服务">
        <PaneCard>
          <PaneRow
            control={
              <PaneSwitch
                checked={settings?.web_search_enabled ?? false}
                disabled={unavailable}
                label="启用网络搜索"
                onChange={(value) =>
                  void save({ web_search_enabled: value }, `网络搜索已${value ? "开启" : "关闭"}`)
                }
              />
            }
            description="全局总开关；启用后仍可在 Agent 配置中单独控制。"
            label="网络搜索"
          />
          <PaneRow
            control={
              <PaneSelect
                ariaLabel="网络搜索来源"
                disabled={unavailable}
                onChange={(value) => void save({ web_search_backend: value }, "搜索来源已保存")}
                options={SEARCH_BACKENDS}
                value={settings?.web_search_backend ?? "ddgs"}
              />
            }
            description="选择服务端使用的搜索 provider。"
            label="搜索来源"
          />
          <PaneRow
            control={
              <span className="cx-pane__input-group">
                <Input
                  aria-label="网络搜索代理地址"
                  className="cx-pane__input cx-pane__input--w240"
                  disabled={unavailable}
                  onChange={(event) => setSearchProxy(event.target.value)}
                  placeholder="http://127.0.0.1:7890"
                  size="sm"
                  value={searchProxy}
                />
                <Button
                  color="secondary"
                  disabled={unavailable || searchProxy === (settings?.web_search_proxy ?? "")}
                  onClick={() => void save({ web_search_proxy: searchProxy.trim() }, "搜索代理已保存")}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              </span>
            }
            description="仅用于访问搜索 provider；留空表示直连。"
            label="搜索代理"
          />
        </PaneCard>
      </PaneSection>
      <PaneSection title="API Key" description="密钥只发送到服务端保存，不会在页面中回显。">
        <PaneCard>
          <PaneRow
            control={
              <span className="cx-pane__input-group cx-artex-secret-input">
                <SettingsSecretInput
                  label="Brave API Key"
                  onChange={setBraveKey}
                  placeholder={settings?.brave_key_set ? "留空则保持当前值" : "输入 API Key"}
                  value={braveKey}
                />
                <Button
                  color="secondary"
                  disabled={unavailable || !braveKey}
                  onClick={async () => {
                    if (await save({ brave_search_api_key: braveKey }, "Brave API Key 已保存")) {
                      setBraveKey("");
                    }
                  }}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              </span>
            }
            description={settings?.brave_key_set ? "已配置。" : "尚未配置。"}
            label="Brave API Key"
          />
          <PaneRow
            control={
              <span className="cx-pane__input-group cx-artex-secret-input">
                <SettingsSecretInput
                  label="Tavily API Key"
                  onChange={setTavilyKey}
                  placeholder={settings?.tavily_key_set ? "留空则保持当前值" : "输入 API Key"}
                  value={tavilyKey}
                />
                <Button
                  color="secondary"
                  disabled={unavailable || !tavilyKey}
                  onClick={async () => {
                    if (await save({ tavily_search_api_key: tavilyKey }, "Tavily API Key 已保存")) {
                      setTavilyKey("");
                    }
                  }}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              </span>
            }
            description={settings?.tavily_key_set ? "已配置。" : "尚未配置。"}
            label="Tavily API Key"
          />
        </PaneCard>
      </PaneSection>
      <PaneSection title="连通性">
        <PaneCard>
          <PaneRow
            control={
              <Button
                color="secondary"
                disabled={unavailable || !settings?.web_search_enabled}
                onClick={() => void runSearchTest()}
                size="sm"
                variant="soft"
              >
                测试连接
              </Button>
            }
            description="使用当前选择的 provider、草稿代理和本次输入的密钥发起真实测试请求。"
            label="测试搜索连接"
          />
          {searchTest ? (
            <PaneRow
              control={null}
              description={searchTest}
              label={searchTest.includes("失败") ? "测试失败" : "测试结果"}
            />
          ) : null}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
