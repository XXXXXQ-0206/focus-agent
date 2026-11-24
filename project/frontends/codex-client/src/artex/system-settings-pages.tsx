import { AlertCircle, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CodexAlertTriangle, CodexArrowLeft, CodexChevronRight, CodexSearch } from "@/icons";
import { Badge, EmptyState, ResourceGrid, ResourceRow, SlatePage } from "@/pages/parts";
import {
  PaneBanner,
  PaneCard,
  PaneEmpty,
  PaneRow,
  PaneSection,
  PaneTextBlock,
  PaneValueText,
} from "@/settings/panes/pane-kit";
import {
  filterSystemLogs,
  mergeSystemLogs,
  type SystemLogLevel,
  type SystemLogLine,
} from "@/settings/system-pages-model";
import { Button, Textarea } from "@/ui";
import { type ArtexAgent, type ArtexAgentDetail, artexApi, openLogsStream } from "./api";
import "./system-settings.css";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

type AgentSection = "overview" | "prompt" | "resources";

/** Agent 目录分段：按来源分档（内置 / 自定义），文案与卡片徽章同源。 */
const AGENT_DIRECTORY_TABS = [
  { id: "all", label: "全部" },
  { id: "builtin", label: "内置" },
  { id: "custom", label: "自定义" },
] as const;

const AGENT_DETAIL_TABS = [
  { value: "overview", label: "配置" },
  { value: "prompt", label: "提示词" },
  { value: "resources", label: "资源" },
] as const satisfies { value: AgentSection; label: string }[];

/**
 * 页头四层的 `data-*` 能力声明与官方 /plugins 页同款；只有 data-scrolled 是动态信号。
 */
const _AGENTS_SLATE_ATTRS = {
  "data-collapsible": "",
  "data-expand-search": "true",
  "data-scroll-collapse": "true",
  "data-sticky": "true",
  "data-wrap-actions": "true",
} as const;

/**
 * Agent 目录页（/system/agents）。
 *
 * 骨架 = Focus 官方「插件」页：
 *   slate 页头（h1 + 搜索胶囊 + 动作）→ 副标题行 → 目录 tab 行 → 两列资源行（.cx-res-grid）。
 * 行是官方 /plugins 目录行语汇：无边框行 + 32px 边框图标块 + 15/13 两行文字 + 右侧 meta/动作。
 * 点击卡片或「查看配置」进入 /system/agents/:key（同一套 slate 骨架的详情页）。
 * 数据全部来自 Focus 服务端 /api/agents；本页不模拟任何写入或切换状态。
 */
export function ArtexAgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<ArtexAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<"all" | "builtin" | "custom">("all");
  const [_scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAgents(await artexApi.agents());
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const onScroll = () => setScrolled(element.scrollTop > 0);
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  const filteredAgents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (directory === "builtin" && !agent.builtin) return false;
      if (directory === "custom" && agent.builtin) return false;
      if (!needle) return true;
      return `${agent.name} ${agent.key} ${agent.description ?? ""}`.toLowerCase().includes(needle);
    });
  }, [agents, directory, query]);

  const builtinAgents = filteredAgents.filter((agent) => agent.builtin);
  const customAgents = filteredAgents.filter((agent) => !agent.builtin);
  const openAgent = (agent: ArtexAgent) => navigate(`/system/agents/${encodeURIComponent(agent.key)}`);

  const renderRow = (agent: ArtexAgent) => (
    <ResourceRow
      action={
        <Button
          aria-label={`打开 ${agent.name}`}
          onClick={(event) => {
            event.stopPropagation();
            openAgent(agent);
          }}
          size="2xs"
          uniform
          variant="ghost"
        >
          <CodexChevronRight size={14} />
        </Button>
      }
      description={agent.description || "Focus 服务端 Agent"}
      icon={<Terminal size={17} />}
      key={agent.key}
      meta={
        <>
          <Badge>{agent.builtin ? "内置" : "自定义"}</Badge>
          <span>{String(agent.tool_count ?? 0)} 个工具</span>
          {agent.enabled === false ? <Badge tone="warning">已停用</Badge> : null}
        </>
      }
      onClick={() => openAgent(agent)}
      title={agent.name}
    />
  );

  return (
    /* ★ 2026-10-15：骨架换成设置页同款（标题带 60 + 768 列 + 728 内容），
       「内置 / 自定义」筛选作为标题带右侧的分段控件（设置页分段口径）。 */
    <SlatePage
      actions={
        <button
          aria-label="刷新"
          className="cx-slate-iconbutton"
          disabled={loading}
          onClick={() => void loadAgents()}
          type="button"
        >
          <RefreshCw size={16} />
        </button>
      }
      search={{
        id: "agents-page-search",
        onChange: setQuery,
        placeholder: "搜索 Agent",
        value: query,
      }}
      subtitle="服务端 Agent 清单、运行配置与提示词。"
      tabs={
        <div className="cx-slate-tabs">
          <div aria-label="Agent 目录" className="cx-slate-tablist" role="tablist">
            {AGENT_DIRECTORY_TABS.map((tab) => (
              <button
                aria-selected={directory === tab.id}
                className="cx-slate-tab"
                key={tab.id}
                onClick={() => setDirectory(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      }
      title="Agent"
    >
      {error ? (
        <EmptyState
          actions={
            <Button onClick={() => void loadAgents()} size="sm" variant="surface">
              重试
            </Button>
          }
          description={error}
          icon={CodexAlertTriangle}
          title="无法加载 Agent"
        />
      ) : null}

      {!error && loading ? (
        <ResourceGrid>
          {Array.from({ length: 6 }, (_, index) => (
            <div className="cx-res-row" key={index}>
              <span className="cx-res-row__icon">
                <span className="cx-skeleton" style={{ width: 17, height: 17 }} />
              </span>
              <span className="cx-res-row__main">
                <span className="cx-skeleton" style={{ width: 160, height: 12 }} />
                <span className="cx-skeleton" style={{ width: 220, height: 10 }} />
              </span>
            </div>
          ))}
        </ResourceGrid>
      ) : null}

      {!error && !loading && filteredAgents.length === 0 ? (
        <EmptyState
          actions={
            <Button
              onClick={() => {
                setQuery("");
                setDirectory("all");
              }}
              size="sm"
              variant="surface"
            >
              清空筛选
            </Button>
          }
          description={
            query
              ? `没有匹配「${query}」的 Agent。换个关键词，或把目录切回「全部」。`
              : "这个目录下还没有 Agent。"
          }
          icon={CodexSearch}
          title="未找到 Agent"
        />
      ) : null}

      {builtinAgents.length > 0 ? (
        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            内置 Agent
            <span className="cx-page__section-count">{builtinAgents.length}</span>
          </h2>
          <ResourceGrid>{builtinAgents.map(renderRow)}</ResourceGrid>
        </section>
      ) : null}

      {customAgents.length > 0 ? (
        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            自定义 Agent
            <span className="cx-page__section-count">{customAgents.length}</span>
          </h2>
          <ResourceGrid>{customAgents.map(renderRow)}</ResourceGrid>
        </section>
      ) : null}
    </SlatePage>
  );
}

/**
 * Agent 详情页（/system/agents/:key）—— 与目录页同一套 slate 骨架：
 * 页头（返回 + 名称 + key）→ 副标题（描述）→ 分区 tab（配置/提示词/资源）→ 内容列。
 */
export function ArtexAgentDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const agentKey = params.key ? decodeURIComponent(params.key) : "";
  const [selected, setSelected] = useState<ArtexAgentDetail | null>(null);
  const [mcpServers, setMcpServers] = useState<Record<string, unknown>[]>([]);
  const [skills, setSkills] = useState<Record<string, unknown>[]>([]);
  const [section, setSection] = useState<AgentSection>("overview");
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken 是刻意的重取触发器，不在 effect 体内直接读取。
  useEffect(() => {
    if (!agentKey) return;
    let active = true;
    setDetailLoading(true);
    setDetailError("");
    artexApi
      .agentDetail(agentKey)
      .then((detail) => {
        if (active) setSelected(detail);
      })
      .catch((caught) => {
        if (active) setDetailError(errorText(caught));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentKey, reloadToken]);

  useEffect(() => {
    void Promise.all([artexApi.mcpServers(), artexApi.skills()])
      .then(([servers, skillList]) => {
        setMcpServers(servers);
        setSkills(skillList);
      })
      .catch(() => undefined);
  }, []);

  const currentAgent = selected?.agent;
  const profileName = selected?.llm_profiles?.find(
    (profile) => profile.id === currentAgent?.llm_profile_id,
  )?.name;
  const mcpIds = new Set(selected?.visibility?.mcp ?? []);
  const skillNames = new Set(selected?.visibility?.skill ?? []);

  return (
    <div className="cx-page" data-page="agents-detail">
      <div className="cx-page__body">
        <div className="cx-slate-scroll">
          <header className="cx-slate-head">
            <div className="cx-slate-head__content">
              <div className="cx-slate-head__row">
                <div className="cx-slate-head__title">
                  <button
                    aria-label="返回 Agent 列表"
                    className="cx-slate-iconbutton"
                    onClick={() => navigate("/system/agents")}
                    type="button"
                  >
                    <CodexArrowLeft size={16} />
                  </button>
                  <h1>{currentAgent?.name ?? agentKey}</h1>
                </div>
                <div className="cx-slate-head__actions">
                  <div className="cx-slate-toolbar">
                    <span className="cx-artex-admin__badge">{currentAgent?.builtin ? "内置" : "自定义"}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="cx-slate-subtitle">
            <div className="cx-slate-subtitle__row" data-page-subtitle="true">
              <div className="cx-slate-subtitle__text">
                {currentAgent?.description || currentAgent?.role || "Focus 服务端 Agent"}
              </div>
            </div>
          </div>

          <div className="cx-slate-tabs">
            <div aria-label="Agent 详情分区" className="cx-slate-tablist" role="tablist">
              {AGENT_DETAIL_TABS.map((tab) => (
                <button
                  aria-selected={section === tab.value}
                  className="cx-slate-tab"
                  key={tab.value}
                  onClick={() => setSection(tab.value)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cx-page__column cx-slate-content" style={{ gap: 20, maxWidth: "none" }}>
            <PaneBanner
              description="此客户端尚未接入 Agent 写入接口。这里展示服务端实时数据，不会模拟保存或切换状态。"
              title="只读详情"
              tone="info"
            />
            <main className="cx-artex-admin__detail-pane">
              {!currentAgent && !detailLoading ? (
                <PaneEmpty
                  icon={<Terminal size={20} />}
                  title="找不到该 Agent"
                  description="它可能已从服务端移除。返回列表重新选择。"
                />
              ) : (
                <>
                  {detailError ? (
                    <PaneBanner
                      tone="danger"
                      title="无法加载 Agent 详情"
                      description={detailError}
                      action={
                        <Button
                          onClick={() => setReloadToken((token) => token + 1)}
                          size="sm"
                          variant="soft"
                          color="secondary"
                        >
                          重试
                        </Button>
                      }
                    />
                  ) : null}
                  {detailLoading ? <PaneBanner title="正在读取 Agent 详情…" /> : null}
                  {!detailLoading && selected && section === "overview" ? (
                    <PaneSection title="运行配置">
                      <PaneCard>
                        <PaneRow
                          label="角色"
                          control={<PaneValueText value={String(selected.agent.role ?? "未设置")} />}
                        />
                        <PaneRow
                          label="状态"
                          control={
                            <PaneValueText value={selected.agent.enabled === false ? "已停用" : "已启用"} />
                          }
                        />
                        <PaneRow
                          label="模型配置"
                          control={<PaneValueText value={profileName ?? "跟随任务或全局配置"} />}
                        />
                        <PaneRow
                          label="最大轮数"
                          control={<PaneValueText value={String(selected.agent.max_turns ?? "不限")} />}
                        />
                        <PaneRow
                          label="运行时长"
                          control={
                            <PaneValueText
                              value={
                                selected.agent.run_seconds
                                  ? `${String(selected.agent.run_seconds)} 秒`
                                  : "不限"
                              }
                            />
                          }
                        />
                        <PaneRow
                          label="网络搜索"
                          control={<PaneValueText value={selected.agent.web_search ? "启用" : "关闭"} />}
                        />
                        <PaneRow
                          label="Shell"
                          control={
                            <PaneValueText value={selected.agent.interactive_shell ? "启用" : "关闭"} />
                          }
                        />
                      </PaneCard>
                      {selected.wrapup_prompt || selected.wrapup_default ? (
                        <PaneCard className="cx-artex-admin__prompt-card">
                          <PaneTextBlock
                            ariaLabel="收尾提示词"
                            label="收尾提示词"
                            description="只读服务端当前值。"
                            value={selected.wrapup_prompt || selected.wrapup_default || ""}
                            onChange={() => undefined}
                            rows={5}
                          />
                        </PaneCard>
                      ) : null}
                    </PaneSection>
                  ) : null}
                  {!detailLoading && selected && section === "prompt" ? (
                    <PaneSection
                      title="系统提示词"
                      description={`${String(selected.versions?.length ?? 0)} 个历史版本`}
                    >
                      <PaneCard>
                        <div className="cx-artex-admin__readonly-block">
                          <Textarea
                            aria-label="Agent 系统提示词"
                            className="cx-pane__textarea"
                            readOnly
                            value={selected.prompt}
                          />
                          <div className="cx-pane__row-footer">
                            <span>服务端当前版本 · {selected.variables?.length ?? 0} 个模板变量</span>
                          </div>
                        </div>
                      </PaneCard>
                      {selected.versions?.length ? (
                        <PaneCard>
                          {selected.versions.map((version) => (
                            <PaneRow
                              key={version.version}
                              label={`版本 ${String(version.version)}`}
                              description={`${version.ts}${version.note ? ` · ${version.note}` : ""}`}
                              control={<PaneValueText value={`${version.template_text.length} 字符`} />}
                            />
                          ))}
                        </PaneCard>
                      ) : null}
                    </PaneSection>
                  ) : null}
                  {!detailLoading && selected && section === "resources" ? (
                    <PaneSection title="可见资源" description="以下可见性来自 Agent 详情 API。">
                      <PaneCard>
                        <PaneRow label="MCP 服务器" control={<PaneValueText value={`${mcpIds.size} 个`} />} />
                        {Array.from(mcpIds).map((id) => {
                          const server = mcpServers.find((item) => Number(item.id) === id);
                          return (
                            <PaneRow
                              key={id}
                              label={String(server?.name ?? `MCP #${id}`)}
                              control={<PaneValueText value="可见" />}
                            />
                          );
                        })}
                        <PaneRow label="技能" control={<PaneValueText value={`${skillNames.size} 个`} />} />
                        {Array.from(skillNames).map((name) => {
                          const skill = skills.find((item) => item.name === name);
                          return (
                            <PaneRow
                              key={name}
                              label={name}
                              description={String(skill?.description ?? "")}
                              control={<PaneValueText value="可见" />}
                            />
                          );
                        })}
                        <PaneRow
                          label="工具绑定"
                          control={<PaneValueText value={`${String(currentAgent?.tool_count ?? 0)} 个`} />}
                        />
                      </PaneCard>
                    </PaneSection>
                  ) : null}
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

const LEVELS: { value: SystemLogLevel; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

function logTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export function ArtexSystemLogsPage() {
  const [lines, setLines] = useState<SystemLogLine[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<SystemLogLevel>("all");
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [recent, history] = await Promise.all([artexApi.recentLogs(), artexApi.logsHistory()]);
      setLines(mergeSystemLogs(history.items, recent.items));
      setHasMore(history.has_more);
      const close = await openLogsStream(
        (line) => setLines((current) => mergeSystemLogs(current, [line])),
        () => setConnected(false),
        recent.cursor,
      );
      setConnected(true);
      return close;
    } catch (caught) {
      setError(errorText(caught));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let closeStream: (() => void) | undefined;
    let active = true;
    void load().then((close) => {
      if (active) closeStream = close;
      else close?.();
    });
    return () => {
      active = false;
      closeStream?.();
    };
  }, [load]);

  const filtered = useMemo(() => filterSystemLogs(lines, query, level), [level, lines, query]);
  const counts = useMemo(
    () => ({
      info: lines.filter((line) => line.level === "info").length,
      warn: lines.filter((line) => line.level === "warn").length,
      error: lines.filter((line) => line.level === "error").length,
    }),
    [lines],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: filtered 是刻意的滚底触发器（新日志到达即贴底）。
  useEffect(() => {
    if (stickToBottom.current && !paused)
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [filtered, paused]);

  const loadOlder = async () => {
    const firstDbId = lines.find((line) => line.db_id)?.db_id;
    if (!firstDbId) return;
    setLoadingOlder(true);
    setError("");
    try {
      const history = await artexApi.logsHistory(firstDbId, 200);
      setLines((current) => mergeSystemLogs(history.items, current));
      setHasMore(history.has_more);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <SlatePage
      actions={
        <>
          <span className="cx-artex-logs__status" data-connected={connected ? "" : undefined}>
            <span aria-hidden />
            {connected ? "实时连接" : "正在重连"}
          </span>
          <Button color="secondary" onClick={() => setPaused((current) => !current)} size="sm" variant="soft">
            {paused ? "恢复自动跟随" : "暂停自动跟随"}
          </Button>
          <Button aria-label="清除当前日志视图" onClick={() => setLines([])} size="sm" variant="ghost">
            清除视图
          </Button>
          <Button
            aria-label="重新连接日志流"
            onClick={() => window.location.reload()}
            size="sm"
            uniform
            variant="ghost"
          >
            <RefreshCw aria-hidden size={14} />
          </Button>
        </>
      }
      search={{
        id: "logs-page-search",
        value: query,
        placeholder: "搜索 tag 或日志内容",
        onChange: setQuery,
      }}
      subtitle="Focus 服务实时输出与历史记录。"
      tabs={
        <div className="cx-slate-tabs">
          <div aria-label="日志级别" className="cx-slate-tablist" role="tablist">
            {LEVELS.map((item) => (
              <button
                aria-selected={level === item.value}
                className="cx-slate-tab"
                key={item.value}
                onClick={() => setLevel(item.value)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      }
      title="系统日志"
    >
      {error ? (
        <PaneBanner
          tone="danger"
          title="日志流暂不可用"
          description={error}
          action={
            <Button onClick={() => window.location.reload()} size="sm" variant="soft" color="secondary">
              重试
            </Button>
          }
        />
      ) : null}
      {error ? (
        <div className="cx-artex-admin__inline-error">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}
      <section aria-label="服务端日志" className="cx-artex-logs__terminal cx-artex-logs-terminal-fixed">
        <div className="cx-artex-logs__terminal-head">
          <Terminal aria-hidden size={15} />
          <span>Focus server</span>
          <span className="cx-artex-logs__visible-count">
            {filtered.length} / {lines.length}
          </span>
        </div>
        <div
          className="cx-artex-logs__viewport"
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          }}
          ref={viewportRef}
          role="log"
          aria-live="off"
          aria-busy={loading}
        >
          {hasMore ? (
            <div className="cx-artex-logs__older">
              <Button disabled={loadingOlder} onClick={() => void loadOlder()} size="sm" variant="ghost">
                {loadingOlder ? "读取中…" : "加载更早日志"}
              </Button>
            </div>
          ) : null}
          {loading && lines.length === 0 ? (
            <div className="cx-artex-admin__quiet">正在读取服务端日志…</div>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <div className="cx-artex-admin__quiet">没有匹配的日志</div>
          ) : null}
          {filtered.map((line, index) => (
            <div
              className="cx-artex-logs__line"
              data-level={line.level}
              key={`${line.seq ?? line.db_id ?? line.ts}:${index}`}
            >
              <span className="cx-artex-logs__time">{logTime(line.ts)}</span>
              <span className="cx-artex-logs__level">{line.level.toUpperCase()}</span>
              {line.tag ? <span className="cx-artex-logs__tag">{line.tag}</span> : null}
              <span className="cx-artex-logs__text">{line.text}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="cx-artex-logs__counts">
        {lines.length} 行 · {counts.info} Info · {counts.warn} Warn · {counts.error} Error
      </p>
    </SlatePage>
  );
}
