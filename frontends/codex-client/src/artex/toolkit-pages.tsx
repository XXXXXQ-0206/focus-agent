import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { CodeBlock } from "@/chat/CodeBlock";
import {
  CodexAlertTriangle,
  CodexCheck,
  CodexFileText,
  CodexFolder,
  CodexFolderPlus,
  CodexLock,
  CodexPaperclip,
  CodexRefresh,
  CodexSearch,
  CodexTerminal,
  CodexTrash,
  CodexWrench,
} from "@/icons";
import { Badge, EmptyState, SlatePage } from "@/pages/parts";
import { useSettings } from "@/settings/store";
import { Button, Dialog, DialogContent, Input } from "@/ui";
import { artexApi } from "./api";
import type {
  CommandRecord,
  Credential,
  SessionExecResult,
  SessionFsEntry,
  ShellSession,
  SSProject,
  SSTask,
  ToolStat,
  TunnelInfo,
  WorkspaceEntry,
  WorkspaceFile,
} from "./types";
import "./toolkit-pages.css";

/**
 * 四个「基础设施」页（工作区 / 命令记录 / 同步 / 内网会话）。
 *
 * 骨架统一为 Codex 官方页头四层（与 /plugins 同构，见 src/pages/PluginsPage.tsx）：
 *   slate 页头（h1 + 搜索胶囊 + 动作）→ 副标题行 →（可选）分区 tab 行 → 内容列。
 * 列表用 .cx-page__list / .cx-row（官方行列表语汇），详情用原生对话框。
 * 数据全部来自 ARTEX 服务端，本页不做任何模拟。
 */

function RowList({ children }: { children: ReactNode }) {
  return <ul className="cx-page__list">{children}</ul>;
}

function Row({
  title,
  subtitle,
  meta,
  icon,
  onClick,
  selected,
  actions,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  actions?: ReactNode;
}) {
  return (
    <li className="cx-row-wrap">
      <button
        className="cx-row"
        data-selected={selected ? "true" : undefined}
        onClick={onClick}
        type="button"
      >
        {icon ? (
          <span aria-hidden className="cx-row__icon">
            {icon}
          </span>
        ) : null}
        <span className="cx-row__main">
          <span className="cx-row__title" title={title}>
            {title}
          </span>
          {subtitle ? <span className="cx-row__subtitle">{subtitle}</span> : null}
        </span>
        {meta ? <span className="cx-row__meta">{meta}</span> : null}
      </button>
      {actions ? <span className="cx-row__actions">{actions}</span> : null}
    </li>
  );
}

function LoadingRows() {
  return (
    <div className="cx-page__list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="cx-row" key={index}>
          <span className="cx-row__icon">
            <span className="cx-skeleton" style={{ width: 18, height: 18 }} />
          </span>
          <span className="cx-row__main">
            <span className="cx-skeleton" style={{ width: 200, height: 12 }} />
            <span className="cx-skeleton" style={{ width: 120, height: 10 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function errorText(caught: unknown): string {
  return caught instanceof Error ? caught.message : "请求失败，请稍后重试。";
}

function formatTime(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/* ── 工作区（/function/workspace）───────────────────────────────────────── */

export function ArtexWorkspacePage() {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ path: string; file: WorkspaceFile } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  // 「默认打开位置」（设置 → 常规）：点开文件的默认动作 = 应用内预览 / 下载
  const { defaultOpenTarget } = useSettings();

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await artexApi.workspaceList(target);
      setPath(result.path);
      setEntries(result.entries);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.dir) {
      void load(entry.path);
      return;
    }
    /*
     * 「默认打开位置」（设置 → 常规，store.defaultOpenTarget）：
     *   preview  → 应用内预览（下面的预览弹窗，默认）
     *   download → 直接下载到本机（走 /api/workspace/download）
     * 这是本工程对官方「默认文件打开位置（VS Code / Cursor …）」的等价实现 ——
     * 纯 Web 客户端没有拉起本机编辑器的通道，能做的是这两种。
     */
    if (defaultOpenTarget === "download") {
      void artexApi.workspaceDownload(entry.path);
      return;
    }
    setPreviewError("");
    setBusy(true);
    try {
      const file = await artexApi.workspaceRead(entry.path);
      setPreview({ path: entry.path, file });
    } catch (caught) {
      setPreviewError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await artexApi.workspaceUpload(path, files);
      await load(path);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const mkdir = async () => {
    const name = window.prompt("新建文件夹名称");
    if (!name) return;
    const target = path ? `${path}/${name}` : name;
    setBusy(true);
    try {
      await artexApi.workspaceMkdir(target);
      await load(path);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: WorkspaceEntry) => {
    if (!window.confirm(`删除 ${entry.path}？`)) return;
    setBusy(true);
    try {
      await artexApi.workspaceDelete(entry.path);
      setPreview(null);
      await load(path);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const segments = path ? path.split("/").filter(Boolean) : [];

  return (
    <SlatePage
      actions={
        <>
          <input hidden multiple onChange={(event) => void upload(event)} ref={uploadRef} type="file" />
          <button
            aria-label="上传文件"
            className="cx-slate-iconbutton"
            disabled={busy}
            onClick={() => uploadRef.current?.click()}
            type="button"
          >
            <CodexPaperclip size={16} />
          </button>
          <button
            aria-label="新建文件夹"
            className="cx-slate-iconbutton"
            disabled={busy}
            onClick={() => void mkdir()}
            type="button"
          >
            <CodexFolderPlus size={16} />
          </button>
          <button
            aria-label="刷新工作区"
            className="cx-slate-iconbutton"
            disabled={loading}
            onClick={() => void load(path)}
            type="button"
          >
            <CodexRefresh size={16} />
          </button>
        </>
      }
      subtitle="ARTEX 平台的受管暂存与工作区文件；只读写服务端真实目录。"
      title="工作区"
    >
      <nav aria-label="当前路径" className="artex-path-bar">
        <button className="artex-path-chip" onClick={() => void load("")} type="button">
          根目录
        </button>
        {segments.map((segment, index) => (
          <span className="artex-path-segment" key={`${segment}-${index}`}>
            <span aria-hidden>/</span>
            <button
              className="artex-path-chip"
              onClick={() => void load(segments.slice(0, index + 1).join("/"))}
              type="button"
            >
              {segment}
            </button>
          </span>
        ))}
      </nav>

      {error ? (
        <EmptyState
          actions={
            <Button onClick={() => void load(path)} size="sm" variant="surface">
              重试
            </Button>
          }
          description={error}
          icon={CodexAlertTriangle}
          title="无法读取工作区"
        />
      ) : null}
      {!error && loading ? <LoadingRows /> : null}
      {!error && !loading && entries.length === 0 ? (
        <EmptyState description="上传文件或新建文件夹后会出现在这里。" icon={CodexFolder} title="目录为空" />
      ) : null}
      {!error && !loading && entries.length > 0 ? (
        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            <CodexFolder size={16} />
            {path || "根目录"}
            <span className="cx-page__section-count">{entries.length}</span>
          </h2>
          <RowList>
            {entries.map((entry) => (
              <Row
                actions={
                  entry.dir ? null : (
                    <>
                      <Button
                        aria-label={`下载 ${entry.name}`}
                        onClick={() => void artexApi.workspaceDownload(entry.path)}
                        size="2xs"
                        uniform
                        variant="ghost"
                      >
                        <CodexFileText size={14} />
                      </Button>
                      <Button
                        aria-label={`删除 ${entry.name}`}
                        onClick={() => void remove(entry)}
                        size="2xs"
                        uniform
                        variant="ghost"
                      >
                        <CodexTrash size={14} />
                      </Button>
                    </>
                  )
                }
                icon={entry.dir ? <CodexFolder size={18} /> : <CodexFileText size={18} />}
                key={entry.path}
                meta={formatTime(entry.mtime)}
                onClick={() => void openEntry(entry)}
                subtitle={`${entry.dir ? "目录" : formatSize(entry.size)} · ${entry.path}`}
                title={entry.name}
              />
            ))}
          </RowList>
        </section>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        open={preview !== null}
      >
        <DialogContent description={preview?.path} title={preview?.path.split("/").pop() ?? "文件预览"}>
          {previewError ? <p className="artex-page-note">{previewError}</p> : null}
          {preview?.file.binary ? (
            <p className="artex-page-note">二进制文件不支持内联预览，请使用下载。</p>
          ) : preview?.file.too_large ? (
            <p className="artex-page-note">文件过大，未内联预览；请下载后查看。</p>
          ) : (
            <CodeBlock code={preview?.file.content ?? ""} language="text" />
          )}
        </DialogContent>
      </Dialog>
    </SlatePage>
  );
}

/* ── 同步（/function/sync）──────────────────────────────────────────────── */

const SYNC_ASSET_TYPES = [
  { key: "subdomain", label: "子域名" },
  { key: "service", label: "服务" },
  { key: "app", label: "App" },
] as const;

export function ArtexSyncPage() {
  const [status, setStatus] = useState<{
    exists: boolean;
    configured: boolean;
    enabled: boolean;
    reachable: boolean;
    url?: string;
    tools: string[];
  } | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [dimension, setDimension] = useState<"project" | "task">("project");
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<SSProject[]>([]);
  const [syncTasks, setSyncTasks] = useState<SSTask[]>([]);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [assetTypes, setAssetTypes] = useState<Set<string>>(
    new Set(SYNC_ASSET_TYPES.map((item) => item.key)),
  );
  const [result, setResult] = useState<{
    synced: Record<string, number>;
    warnings: string[] | null;
    errors: string[] | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await artexApi.ssStatus();
      setStatus(next);
      setUrl(next.url ?? "");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.configured) return;
    let active = true;
    if (dimension === "project") {
      void artexApi
        .ssProjects(1, 50, query)
        .then((page) => {
          if (active) setProjects(page.projects);
        })
        .catch(() => undefined);
    } else {
      void artexApi
        .ssTasks(1, 50, query)
        .then((rows) => {
          if (active) setSyncTasks(rows);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [dimension, query, status?.configured]);

  const saveDatasource = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await artexApi.ssDatasource({ url: url.trim(), api_key: apiKey });
      setApiKey("");
      setNotice("数据源已保存并启用");
      await loadStatus();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggleTarget = (id: string) => {
    setTargets((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSync = async () => {
    if (targets.size === 0) {
      setError("请至少选择一个同步目标。");
      return;
    }
    if (assetTypes.size === 0) {
      setError("请至少选择一种资产类型。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const syncResult = await artexApi.ssSync({
        dimension,
        targets: Array.from(targets),
        asset_types: Array.from(assetTypes),
      });
      setResult({
        synced: syncResult.synced,
        warnings: syncResult.warnings,
        errors: syncResult.errors,
      });
      setNotice("同步完成");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = !status
    ? "检测中"
    : !status.exists
      ? "未创建"
      : !status.configured
        ? "未配置"
        : !status.enabled
          ? "未启用"
          : status.reachable
            ? "已就绪"
            : "不可达";

  return (
    <SlatePage
      actions={
        <button
          aria-label="重新检测数据源"
          className="cx-slate-iconbutton"
          disabled={loading}
          onClick={() => void loadStatus()}
          type="button"
        >
          <CodexRefresh size={16} />
        </button>
      }
      search={{
        id: "sync-search",
        value: query,
        placeholder: dimension === "project" ? "搜索项目名" : "搜索任务名",
        onChange: setQuery,
      }}
      subtitle="从外部数据源（ScopeSentry）把资产同步进 ARTEX 资产库。"
      title="资产同步"
    >
      <section className="cx-page__section">
        <h2 className="cx-page__section-title">
          <CodexLock size={16} />
          数据源
          <span className="cx-page__section-count">
            <Badge tone={status?.reachable ? "open" : undefined}>{statusLabel}</Badge>
          </span>
        </h2>
        <div className="artex-sync-form">
          <div className="artex-form-row">
            <span>MCP 地址</span>
            <Input
              aria-label="ScopeSentry MCP 地址"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://<主机>:8082/mcp"
              value={url}
            />
          </div>
          <div className="artex-form-row">
            <span>API Key</span>
            <Input
              aria-label="ScopeSentry API Key"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={status?.configured ? "留空保留原值" : "ssk_..."}
              type="password"
              value={apiKey}
            />
          </div>
          <div className="artex-form-actions">
            <Button
              color="secondary"
              disabled={busy || !url.trim()}
              onClick={() => void saveDatasource()}
              size="sm"
              variant="soft"
            >
              保存并启用
            </Button>
            {status?.tools?.length ? (
              <span className="artex-page-note">可选工具：{status.tools.join(" · ")}</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="cx-page__section">
        <h2 className="cx-page__section-title">
          <CodexWrench size={16} />
          选择数据同步
          <span className="cx-page__section-count">{targets.size} 个已选</span>
        </h2>
        <div className="artex-sync-toolbar">
          <div className="cx-seg" style={{ flex: "0 0 auto" }}>
            {(["project", "task"] as const).map((value) => (
              <button
                className="cx-seg__item"
                data-selected={dimension === value ? "true" : undefined}
                key={value}
                onClick={() => {
                  setDimension(value);
                  setTargets(new Set());
                }}
                type="button"
              >
                {value === "project" ? "项目维度" : "任务维度"}
              </button>
            ))}
          </div>
          <span className="artex-sync-types">
            同步资产：
            {SYNC_ASSET_TYPES.map((item) => (
              <label className="artex-check" key={item.key}>
                <input
                  checked={assetTypes.has(item.key)}
                  onChange={() =>
                    setAssetTypes((current) => {
                      const next = new Set(current);
                      if (next.has(item.key)) next.delete(item.key);
                      else next.add(item.key);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                {item.label}
              </label>
            ))}
          </span>
        </div>

        {!status?.configured ? (
          <EmptyState
            description="先在上方保存 ScopeSentry 数据源，然后这里会列出可选的项目或任务。"
            icon={CodexLock}
            title="数据源尚未配置"
          />
        ) : (dimension === "project" ? projects : syncTasks).length === 0 ? (
          <EmptyState
            description="调整搜索条件，或等待数据源返回。"
            icon={CodexSearch}
            title="没有可选目标"
          />
        ) : (
          <RowList>
            {dimension === "project"
              ? projects.map((project) => (
                  <Row
                    icon={<CodexFolder size={18} />}
                    key={project.id}
                    meta={project.AssetCount !== undefined ? `${project.AssetCount} 资产` : undefined}
                    onClick={() => toggleTarget(project.id)}
                    selected={targets.has(project.id)}
                    subtitle={project.tag ? `标签 ${project.tag}` : project.name}
                    title={project.name || project.id}
                  />
                ))
              : syncTasks.map((item) => (
                  <Row
                    icon={<CodexCheck size={18} />}
                    key={item.id}
                    meta={item.progress !== undefined ? `${item.progress}%` : undefined}
                    onClick={() => toggleTarget(item.id)}
                    selected={targets.has(item.id)}
                    subtitle={`${item.status ?? "—"} · ${formatTime(item.creatTime)}`}
                    title={item.name || item.id}
                  />
                ))}
          </RowList>
        )}

        <div className="artex-form-actions">
          <Button
            disabled={busy || !status?.configured || targets.size === 0}
            onClick={() => void runSync()}
            size="sm"
            variant="solid"
          >
            {busy ? "同步中…" : `同步 ${targets.size} 个目标`}
          </Button>
        </div>
      </section>

      {result ? (
        <section className="cx-page__section">
          <h2 className="cx-page__section-title">
            <CodexCheck size={16} />
            同步结果
          </h2>
          <div className="artex-stat-chips">
            {Object.entries(result.synced).map(([type, count]) => (
              <span className="artex-stat-chip" key={type}>
                <strong>{type}</strong>
                <span>{count} 条</span>
              </span>
            ))}
          </div>
          {result.warnings?.length ? (
            <p className="artex-page-note">警告：{result.warnings.slice(0, 5).join("；")}</p>
          ) : null}
          {result.errors?.length ? (
            <p className="artex-page-note">错误：{result.errors.slice(0, 5).join("；")}</p>
          ) : null}
        </section>
      ) : null}

      {error || notice ? (
        <section className="cx-page__section">
          {error ? (
            <p className="artex-page-note" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="artex-page-note">{notice}</p> : null}
        </section>
      ) : null}
    </SlatePage>
  );
}

/* ── 内网会话（/intranet）──────────────────────────────────────────────── */

type IntranetTab = "sessions" | "tunnels" | "credentials";

export function ArtexIntranetPage() {
  const [tab, setTab] = useState<IntranetTab>("sessions");
  const [tasks, setTasks] = useState<{ id: string; label: string }[]>([]);
  const [task, setTask] = useState("");
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [activeSession, setActiveSession] = useState<ShellSession | null>(null);
  const [probeResult, setProbeResult] = useState("");
  const [command, setCommand] = useState("");
  const [execResult, setExecResult] = useState<SessionExecResult | null>(null);
  const [fsPath, setFsPath] = useState(".");
  const [fsEntries, setFsEntries] = useState<SessionFsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void artexApi
      .tasks()
      .then((result) =>
        setTasks(
          result.tasks.map((item) => ({
            id: item.id,
            label: item.name?.trim() || item.description?.trim() || item.id,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionRows, tunnelRows, credentialRows] = await Promise.all([
        artexApi.shellSessions(task || undefined),
        artexApi.tunnels(task || undefined),
        artexApi.credentials(task || undefined),
      ]);
      setSessions(sessionRows);
      setTunnels(tunnelRows);
      setCredentials(credentialRows);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [task]);

  useEffect(() => {
    void load();
  }, [load]);

  const probe = async (session: ShellSession) => {
    setBusy(true);
    setProbeResult("探测中…");
    try {
      const result = await artexApi.probeSession(session.id);
      setProbeResult(result.alive ? `在线 · ${result.ms ?? "?"} ms` : `离线 · ${result.error || "无响应"}`);
    } catch (caught) {
      setProbeResult(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const exec = async () => {
    if (!activeSession || !command.trim()) return;
    setBusy(true);
    setExecResult(null);
    try {
      setExecResult(await artexApi.sessionExec(activeSession.id, command.trim()));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const listFiles = async () => {
    if (!activeSession) return;
    setBusy(true);
    try {
      setFsEntries(await artexApi.sessionList(activeSession.id, fsPath.trim() || "."));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const teardown = async (tunnel: TunnelInfo) => {
    if (!window.confirm(`断开隧道 ${tunnel.id}？`)) return;
    setBusy(true);
    try {
      await artexApi.teardownTunnel(tunnel.id);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: IntranetTab; label: string; count: number }[] = [
    { id: "sessions", label: "会话", count: sessions.length },
    { id: "tunnels", label: "隧道", count: tunnels.length },
    { id: "credentials", label: "凭据", count: credentials.length },
  ];

  return (
    <SlatePage
      actions={
        <>
          <div className="artex-task-filter">
            <select
              aria-label="按任务筛选内网记录"
              onChange={(event) => setTask(event.target.value)}
              value={task}
            >
              <option value="">全部任务</option>
              {tasks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <button
            aria-label="刷新内网记录"
            className="cx-slate-iconbutton"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <CodexRefresh size={16} />
          </button>
        </>
      }
      subtitle="立足点会话、隧道与收集到的凭据（密钥只显示脱敏值）。"
      tabs={
        <div className="cx-slate-tabs">
          <div aria-label="内网记录分类" className="cx-slate-tablist" role="tablist">
            {tabs.map((item) => (
              <button
                aria-selected={tab === item.id}
                className="cx-slate-tab"
                key={item.id}
                onClick={() => setTab(item.id)}
                role="tab"
                type="button"
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>
        </div>
      }
      title="内网会话"
    >
      {error ? (
        <EmptyState
          actions={
            <Button onClick={() => void load()} size="sm" variant="surface">
              重试
            </Button>
          }
          description={error}
          icon={CodexAlertTriangle}
          title="无法加载内网记录"
        />
      ) : null}
      {!error && loading ? <LoadingRows /> : null}

      {!error && !loading && tab === "sessions" ? (
        sessions.length === 0 ? (
          <EmptyState
            description="任务取得立足点后，会话会出现在这里。"
            icon={CodexTerminal}
            title="暂无会话"
          />
        ) : (
          <section className="cx-page__section">
            <h2 className="cx-page__section-title">
              <CodexTerminal size={16} />
              会话
              <span className="cx-page__section-count">{sessions.length}</span>
            </h2>
            <RowList>
              {sessions.map((session) => (
                <Row
                  icon={<CodexTerminal size={18} />}
                  key={session.id}
                  meta={
                    <span className="artex-row-meta">
                      <Badge tone={session.status === "alive" ? "open" : undefined}>
                        {session.status || "未知"}
                      </Badge>
                      {formatTime(session.last_beat)}
                    </span>
                  }
                  onClick={() => {
                    setActiveSession(session);
                    setProbeResult("");
                    setExecResult(null);
                    setFsEntries([]);
                    void probe(session);
                  }}
                  selected={activeSession?.id === session.id}
                  subtitle={`${session.kind || "session"} · ${session.host_asset_id || session.url || "—"}`}
                  title={session.id}
                />
              ))}
            </RowList>

            {activeSession ? (
              <div className="artex-console">
                <header className="artex-console__head">
                  <strong>{activeSession.id}</strong>
                  <span>{probeResult || "等待探活结果…"}</span>
                </header>
                <div className="artex-console__exec">
                  <Input
                    aria-label="在会话中执行的命令"
                    onChange={(event) => setCommand(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void exec();
                    }}
                    placeholder="输入命令后回车执行（例如 id / whoami）"
                    value={command}
                  />
                  <Button
                    disabled={busy || !command.trim()}
                    onClick={() => void exec()}
                    size="sm"
                    variant="soft"
                    color="secondary"
                  >
                    执行
                  </Button>
                </div>
                {execResult ? (
                  <CodeBlock
                    code={
                      `${execResult.stdout}${execResult.stderr ? `\n[stderr]\n${execResult.stderr}` : ""}`.trim() ||
                      "（无输出）"
                    }
                    language="bash"
                  />
                ) : null}
                <div className="artex-console__fs">
                  <Input
                    aria-label="会话内列目录路径"
                    onChange={(event) => setFsPath(event.target.value)}
                    placeholder="."
                    value={fsPath}
                  />
                  <Button disabled={busy} onClick={() => void listFiles()} size="sm" variant="surface">
                    列目录
                  </Button>
                </div>
                {fsEntries.length > 0 ? (
                  <div className="artex-console__entries">
                    {fsEntries.map((entry) => (
                      <span key={entry.name}>
                        {entry.is_dir ? <CodexFolder size={13} /> : <CodexFileText size={13} />} {entry.name}
                        {entry.is_dir ? "" : ` · ${formatSize(entry.size)}`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )
      ) : null}

      {!error && !loading && tab === "tunnels" ? (
        tunnels.length === 0 ? (
          <EmptyState description="内网隧道建立后会出现在这里。" icon={CodexLock} title="暂无隧道" />
        ) : (
          <section className="cx-page__section">
            <h2 className="cx-page__section-title">
              <CodexLock size={16} />
              隧道
              <span className="cx-page__section-count">{tunnels.length}</span>
            </h2>
            <RowList>
              {tunnels.map((tunnel) => (
                <Row
                  actions={
                    <Button disabled={busy} onClick={() => void teardown(tunnel)} size="sm" variant="ghost">
                      断开
                    </Button>
                  }
                  icon={<CodexLock size={18} />}
                  key={tunnel.id}
                  meta={<Badge>{tunnel.state || "—"}</Badge>}
                  subtitle={`${tunnel.listen_host}:${tunnel.listen_port} → ${tunnel.target_host ?? "?"}:${tunnel.target_port ?? "?"} · 经 ${tunnel.via_session_id || "—"}`}
                  title={`${tunnel.kind || "tunnel"} · ${tunnel.id}`}
                />
              ))}
            </RowList>
          </section>
        )
      ) : null}

      {!error && !loading && tab === "credentials" ? (
        credentials.length === 0 ? (
          <EmptyState description="收集到凭据后会出现在这里。" icon={CodexLock} title="暂无凭据" />
        ) : (
          <section className="cx-page__section">
            <h2 className="cx-page__section-title">
              <CodexLock size={16} />
              凭据
              <span className="cx-page__section-count">{credentials.length}</span>
            </h2>
            <RowList>
              {credentials.map((credential) => (
                <Row
                  icon={<CodexLock size={18} />}
                  key={credential.id}
                  meta={
                    <span className="artex-row-meta">
                      {credential.verified ? <Badge tone="open">已验证</Badge> : null}
                      {formatTime(credential.created_at)}
                    </span>
                  }
                  subtitle={`${credential.cred_type} · ${credential.username || "—"}${credential.domain ? ` @ ${credential.domain}` : ""} · ${credential.secret_masked || "（未返回密钥）"}`}
                  title={`#${credential.id} · ${credential.source || "收集"}`}
                />
              ))}
            </RowList>
            <p className="artex-page-note">密钥为服务端脱敏值，客户端不会解密或回显明文。</p>
          </section>
        )
      ) : null}
    </SlatePage>
  );
}
