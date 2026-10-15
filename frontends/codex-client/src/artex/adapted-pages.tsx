import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  CodexAlertTriangle,
  CodexChevronRight,
  CodexGrid,
  CodexRailPlugins,
  CodexRefresh,
  CodexSearch,
  CodexSettingsConfig,
  CodexSettingsSkills,
  CodexWrench,
} from "@/icons";
import { TrafficPage } from "@/pages/OperationsPages";
import { Badge, EmptyState, ResourceGrid, ResourceRow, SearchField, SlatePage } from "@/pages/parts";
import type { SettingsNavIcon } from "@/settings/nav-model";
import { Button, Dialog, DialogContent, Input, Spinner, Textarea } from "@/ui";
import { artexApi } from "./api";
import type { Task } from "./types";
import "./system-resource-pages.css";

type Row = Record<string, unknown>;
type SystemKind = "llm" | "mcp" | "tools" | "skills" | "traffic";

function text(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : "无法加载 ARTEX 数据";
}

function DataPage({
  title,
  description,
  toolbar,
  children,
}: {
  /** 旧 ops 骨架的栏目标签；改用设置页骨架后不再渲染（保留入参避免调用点改动） */
  kicker?: string;
  title: string;
  description: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {

  /**
   * ★ 2026-10-15：本骨架原来是自己那套 ops chrome（kicker 行 + ops-page intro + 表格），
   *   现已换成**设置页骨架**（SlatePage = 标题带 60 + 768 列 + 728 内容），
   *   与左侧栏其余页面、设置页统一到同一份规范；调用点的 props 一个没改。
   */
  return (
    <SlatePage actions={toolbar} subtitle={description} title={title}>
      {children}
    </SlatePage>
  );
}

function Loading() {
  return (
    <div className="ops-loading" role="status">
      <Spinner size="md" />
      <span>正在加载 ARTEX 数据</span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ops-error" role="alert">
      <CodexAlertTriangle size={17} />
      <span>{message}</span>
      <Button onClick={onRetry} size="sm" variant="ghost">
        重试
      </Button>
    </div>
  );
}

function Table({
  columns,
  rows,
  rowKey = "id",
}: {
  columns: { key: string; label: string }[];
  rows: Row[];
  rowKey?: string;
}) {
  return (
    <table className={`ops-table${columns.length === 4 ? " ops-table--four" : ""}`}>
      <thead>
        <tr className="ops-table__head">
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr className="ops-table__row" key={text(row[rowKey], String(index))}>
            {columns.map((column) => (
              <td className="ops-table__cell" key={column.key} title={text(row[column.key])}>
                {text(row[column.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ARTEX task inventory, rendered in the same page surface as operations pages. */
export function ArtexTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 「新建任务」对话框：首页不再代建任务（首页已对齐原版站点 = 模式对话入口），
  // 任务创建回到任务页，字段与原版站点的新建任务抽屉一致的最小集（名称/描述/目标）。
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftGoal, setDraftGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTasks((await artexApi.tasks()).tasks);
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      `${task.id} ${task.name ?? ""} ${task.description ?? ""} ${task.status ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, tasks]);

  const createTask = async () => {
    if (creating || !draftDescription.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await artexApi.createTask({
        name: draftName.trim(),
        description: draftDescription.trim(),
        goal: draftGoal.trim() || draftDescription.trim(),
      });
      setCreateOpen(false);
      setDraftName("");
      setDraftDescription("");
      setDraftGoal("");
      window.dispatchEvent(new CustomEvent("artex:tasks-changed"));
      navigate(`/task/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "任务创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <DataPage
      description="查看并继续 ARTEX 的真实自主测试任务。"
      kicker="ARTEX / FUNCTION"
      title="任务"
      toolbar={
        <>
          <Button aria-label="刷新任务" onClick={() => void load()} size="sm" uniform variant="ghost">
            <CodexRefresh size={14} />
          </Button>
          <Button onClick={() => setCreateOpen(true)} size="sm" variant="surface">
            新建任务
          </Button>
        </>
      }
    >
      <div className="cx-page__toolbar cx-page__toolbar--inner">
        <SearchField ariaLabel="搜索任务" onChange={setQuery} placeholder="搜索任务" value={query} />
        <span className="ops-total">
          {visible.length} / {tasks.length} 项
        </span>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!error && loading ? <Loading /> : null}
      {!error && !loading && visible.length === 0 ? (
        <EmptyState
          description="创建任务后，ARTEX 的执行状态和活动会显示在这里。"
          icon={CodexGrid}
          title="暂无任务"
        />
      ) : null}
      {!error && !loading && visible.length > 0 ? (
        <>
          <Table
            columns={[
              { key: "name", label: "任务" },
              { key: "status", label: "状态" },
              { key: "engine_mode", label: "引擎" },
              { key: "last_activity", label: "最近活动" },
            ]}
            rows={visible.map((task) => ({
              ...task,
              name: task.name || task.description || task.id,
              status: task.status || (task.in_flight ? "running" : "created"),
              last_activity: task.last_activity || task.last_activity_unix || task.created_at,
            }))}
          />
          <div className="artex-task-links">
            {visible.slice(0, 8).map((task) => (
              <Link key={task.id} to={`/task/${encodeURIComponent(task.id)}`}>
                打开 {task.name || task.description || task.id}
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <Dialog
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError("");
        }}
        open={createOpen}
      >
        <DialogContent
          description="与 ARTEX 原生新建任务一致：描述是任务正文，目标是 planner 的判据。"
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)} size="sm" variant="ghost">
                取消
              </Button>
              <Button
                color="primary"
                disabled={creating || draftDescription.trim().length === 0}
                onClick={() => void createTask()}
                size="sm"
                variant="solid"
              >
                {creating ? "创建中…" : "创建任务"}
              </Button>
            </>
          }
          title="新建 ARTEX 任务"
        >
          <div className="artex-task-create">
            <label className="artex-task-create__field" htmlFor="artex-task-name">
              <span>名称（可选）</span>
              <Input
                id="artex-task-name"
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：example.com 外部体检"
                value={draftName}
              />
            </label>
            <label className="artex-task-create__field" htmlFor="artex-task-description">
              <span>描述</span>
              <Textarea
                id="artex-task-description"
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="要测什么、边界在哪、有哪些已知信息"
                rows={3}
                value={draftDescription}
              />
            </label>
            <label className="artex-task-create__field" htmlFor="artex-task-goal">
              <span>目标（可选）</span>
              <Textarea
                id="artex-task-goal"
                onChange={(event) => setDraftGoal(event.target.value)}
                placeholder="例如：拿到可复现的证据并登记漏洞"
                rows={2}
                value={draftGoal}
              />
            </label>
            {createError ? (
              <p className="artex-codex-error" role="alert">
                {createError}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </DataPage>
  );
}

const SYSTEM_CONFIG: Record<SystemKind, { title: string; description: string }> = {
  llm: { title: "LLM 配置", description: "读取 ARTEX 当前模型配置与配置池。" },
  mcp: { title: "MCP 服务器", description: "读取真实 MCP 服务器连接和启用状态。" },
  tools: { title: "工具", description: "查看后端可用工具目录。" },
  skills: { title: "技能", description: "查看后端可用技能及调用统计。" },
  traffic: { title: "流量", description: "查看代理捕获的真实 HTTP 交换。" },
};

/** Shared renderer for ARTEX system endpoints. Data is always fetched from the API. */
export function ArtexSystemPage({ kind }: { kind: SystemKind }) {
  if (kind === "traffic") return <TrafficPage />;
  return <ArtexSystemDataPage kind={kind} />;
}

function resourceId(row: Row, index: number) {
  return text(row.id ?? row.key ?? row.name, String(index));
}

function resourceName(row: Row, index: number) {
  return text(row.name ?? row.label ?? row.key ?? row.id, `项目 ${index + 1}`);
}

function safeValue(key: string, value: unknown) {
  if (/secret|token|password|api.?key|authorization|credential/i.test(key)) {
    return value ? "已配置" : "未配置";
  }
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    return JSON.stringify(
      value,
      (nestedKey, nestedValue) =>
        /secret|token|password|api.?key|authorization|credential/i.test(nestedKey) && nestedValue
          ? "已配置"
          : nestedValue,
      2,
    );
  }
  return String(value);
}

const SYSTEM_LABELS: Record<string, string> = {
  name: "名称",
  model: "模型",
  provider: "提供商",
  format: "格式",
  base_url: "服务地址",
  url: "服务地址",
  transport: "传输方式",
  command: "命令",
  args: "参数",
  env: "环境变量",
  headers: "请求头",
  enabled: "状态",
  is_default: "默认配置",
  description: "说明",
  calls: "调用次数",
  usage_count: "调用次数",
  last_used: "最近使用",
  tools: "可用工具",
  agents: "关联 Agent",
  skill_count: "技能数量",
  created_at: "创建时间",
};

const RESOURCE_SLATE_ATTRS = {
  "data-collapsible": "",
  "data-expand-search": "true",
  "data-scroll-collapse": "true",
  "data-sticky": "true",
  "data-wrap-actions": "true",
} as const;

const RESOURCE_PAGE_META: Record<
  Exclude<SystemKind, "traffic">,
  { icon: SettingsNavIcon; listTitle: string; subtitle: (row: Row) => string }
> = {
  llm: {
    icon: CodexSettingsConfig,
    listTitle: "模型配置",
    subtitle: (row) =>
      [text(row.provider, ""), text(row.model, "")].filter(Boolean).join(" · ") || "模型配置",
  },
  mcp: {
    icon: CodexRailPlugins,
    listTitle: "MCP 服务器",
    subtitle: (row) =>
      [text(row.transport, ""), text(row.url ?? row.command, "")].filter(Boolean).join(" · ") || "MCP 服务器",
  },
  tools: {
    icon: CodexWrench,
    listTitle: "工具目录",
    subtitle: (row) => {
      const agents = Array.isArray(row.agents) ? row.agents.length : 0;
      return [text(row.kind, ""), agents ? `${agents} 个 Agent` : ""].filter(Boolean).join(" · ") || "工具";
    },
  },
  skills: {
    icon: CodexSettingsSkills,
    listTitle: "技能目录",
    subtitle: (row) => {
      const calls = Number(row.calls ?? row.usage_count ?? 0);
      return calls > 0 ? `${calls} 次调用` : "技能";
    },
  },
};

function resourceBadges(kind: Exclude<SystemKind, "traffic">, row: Row) {
  const badges: ReactNode[] = [];
  if (kind === "tools") {
    badges.push(<Badge key="kind">{row.kind === "builtin" ? "内置" : "自定义"}</Badge>);
    const calls = Number(row.calls ?? 0);
    if (calls > 0) badges.push(<Badge key="calls">{`${calls} 次调用`}</Badge>);
  } else if (kind === "llm") {
    if (row.is_default) badges.push(<Badge key="default">默认</Badge>);
    if (row.provider) badges.push(<Badge key="provider">{text(row.provider)}</Badge>);
  } else if (kind === "mcp") {
    badges.push(<Badge key="transport">{text(row.transport, "stdio")}</Badge>);
  }
  if (row.enabled === false)
    badges.push(
      <Badge key="disabled" tone="warning">
        已停用
      </Badge>,
    );
  return badges;
}

/**
 * ARTEX 系统资源页（/system/llm、/system/mcp、/system/tools、/system/skills）。
 *
 * 骨架 = Codex 官方「插件」页（src/pages/PluginsPage.tsx）：slate 页头（标题 + 搜索胶囊 + 刷新）
 * → 副标题行 → 内容列的两列资源行（.cx-res-grid；官方 /plugins 目录行语汇）。
 * 点卡片或「查看详情」打开详情对话框（字段表 + 工具 schema），数据全部来自 ARTEX 服务端，
 * 本页只读，不提供写入（写入在原生设置分区里）。
 */
function ArtexSystemDataPage({ kind }: { kind: Exclude<SystemKind, "traffic"> }) {
  const [items, setItems] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Row>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailName, setDetailName] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const config = SYSTEM_CONFIG[kind];
  const pageMeta = RESOURCE_PAGE_META[kind];
  const ResourceIcon = pageMeta.icon;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (kind === "llm") {
        setMeta(await artexApi.llm());
        setItems((await artexApi.llmProfiles()) as Row[]);
      } else if (kind === "mcp") {
        setItems((await artexApi.mcpServers()) as Row[]);
      } else if (kind === "tools") {
        setItems((await artexApi.tools()) as Row[]);
      } else {
        setItems((await artexApi.skills()) as Row[]);
      }
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const onScroll = () => setScrolled(element.scrollTop > 0);
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      Object.values(item).some((value) =>
        String(value ?? "")
          .toLocaleLowerCase()
          .includes(needle),
      ),
    );
  }, [items, query]);

  const openDetail = (row: Row, index: number) => {
    setDetail(row);
    setDetailName(resourceName(row, index));
  };

  const detailFields = detail
    ? Object.entries(detail).filter(([key, value]) => value !== undefined && value !== null && key !== "id")
    : [];

  return (
    <>
      {/* ★ 2026-10-15：骨架换成设置页同款（标题带 + 768 列 + 728 内容），见 pages/parts.tsx */}
      <SlatePage
        actions={
          <button
            aria-label={`刷新${config.title}`}
            className="cx-slate-iconbutton"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <CodexRefresh size={16} />
          </button>
        }
        search={{
          id: `system-${kind}-search`,
          onChange: setQuery,
          placeholder: `搜索${config.title}`,
          value: query,
        }}
        subtitle={config.description}
        title={config.title}
      >
            {kind === "llm" && Object.keys(meta).length > 0 ? (
              <section className="cx-page__section">
                <h2 className="cx-page__section-title">
                  <CodexSettingsConfig size={16} />
                  当前运行模型
                </h2>
                <ResourceGrid>
                  <ResourceRow
                    description={`API Key ${meta.key_set ? "已配置" : "未配置"} · ${items.length} 个模型配置`}
                    icon={<CodexSettingsConfig size={17} />}
                    meta={
                      <Badge tone={meta.configured ? "open" : undefined}>
                        {meta.configured ? "已配置" : "尚未配置"}
                      </Badge>
                    }
                    title={`${text(meta.provider)} · ${text(meta.model)}`}
                  />
                </ResourceGrid>
              </section>
            ) : null}

            {error ? (
              <EmptyState
                actions={
                  <Button onClick={() => void load()} size="sm" variant="surface">
                    重试
                  </Button>
                }
                description={error}
                icon={CodexAlertTriangle}
                title={`无法加载${config.title}`}
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

            {!error && !loading && visibleItems.length === 0 ? (
              <EmptyState
                actions={
                  query ? (
                    <Button onClick={() => setQuery("")} size="sm" variant="surface">
                      清空搜索
                    </Button>
                  ) : null
                }
                description={query ? "调整搜索条件，或清空搜索。" : "ARTEX 服务当前没有返回此类记录。"}
                icon={CodexGrid}
                title={query ? "没有匹配的项目" : "暂无数据"}
              />
            ) : null}

            {!error && !loading && visibleItems.length > 0 ? (
              <section className="cx-page__section">
                <h2 className="cx-page__section-title">
                  {pageMeta.listTitle}
                  <span className="cx-page__section-count">{visibleItems.length}</span>
                </h2>
                {kind === "tools" || kind === "skills" ? (
                  /* 工具目录按用户裁决保留**卡片**版式（[C] 官方卡片 chrome：
                     图标 + 名称 + 来源行 + 描述 + 徽章/动作页脚，minmax(280px) 自适应网格）。
                     2026-10-15 用户追加：「skills 做成和工具类似的卡片」⇒ 技能目录同款卡片
                     （技能页从设置**还原回探索**，所以这里按 kind 一起走卡片分支）。 */
                  <div className="cx-card-grid">
                    {visibleItems.map((row, index) => {
                      const name = resourceName(row, index);
                      return (
                        <article className="cx-card cx-card--interactive" key={resourceId(row, index)}>
                          <header className="cx-card__head">
                            <span aria-hidden className="cx-row__icon">
                              <ResourceIcon size={20} />
                            </span>
                            <span className="cx-row__main">
                              <span className="cx-card__name-row">
                                <span className="cx-card__title">{name}</span>
                              </span>
                              <span className="cx-card__author">{pageMeta.subtitle(row)}</span>
                            </span>
                          </header>
                          <p className="cx-card__description">{text(row.description, config.description)}</p>
                          <footer className="cx-card__footer">
                            <span className="cx-card__tags">{resourceBadges(kind, row)}</span>
                            <Button onClick={() => openDetail(row, index)} size="sm" variant="surface">
                              查看详情
                            </Button>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <ResourceGrid>
                    {visibleItems.map((row, index) => (
                      <ResourceRow
                        action={
                          <Button
                            aria-label={`查看 ${resourceName(row, index)} 的详情`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetail(row, index);
                            }}
                            size="2xs"
                            uniform
                            variant="ghost"
                          >
                            <CodexChevronRight size={14} />
                          </Button>
                        }
                        description={text(row.description, config.description)}
                        icon={<ResourceIcon size={17} />}
                        key={resourceId(row, index)}
                        meta={resourceBadges(kind, row)}
                        onClick={() => openDetail(row, index)}
                        title={resourceName(row, index)}
                      />
                    ))}
                  </ResourceGrid>
                )}
              </section>
            ) : null}
      </SlatePage>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        open={detail !== null}
      >
        <DialogContent description={detail ? pageMeta.subtitle(detail) : undefined} title={detailName}>
          <dl className="artex-system-fields">
            {detailFields.map(([key, value]) => (
              <div className="cx-detail__field" key={key}>
                <dt className="cx-detail__label">{SYSTEM_LABELS[key] ?? key}</dt>
                <dd className="cx-detail__value">{safeValue(key, value)}</dd>
              </div>
            ))}
          </dl>
          {kind === "tools" && detail?.schema ? (
            <pre className="artex-system-code">{safeValue("schema", detail.schema)}</pre>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
