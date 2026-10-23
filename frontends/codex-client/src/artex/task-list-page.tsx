import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CodexAlertTriangle, CodexGrid, CodexRefresh, CodexSearch } from "@/icons";
import { EmptyState, SlatePage } from "@/pages/parts";
import { PanelPortal } from "@/shell";
import { Button, Spinner } from "@/ui";
import { artexApi } from "./api";
import type { Task } from "./types";
import "./task-list-page.css";

function label(task: Task) {
  return task.name?.trim() || task.description?.trim() || task.goal?.trim() || `任务 ${task.id}`;
}

function status(task: Task) {
  if (task.paused || task.status === "paused") return "已暂停";
  if (task.queued || task.status === "queued") return "排队中";
  if (task.status === "running" || task.in_flight) return "运行中";
  if (task.status === "done" || task.status === "completed") return "已完成";
  if (task.status === "failed" || task.status === "error") return "失败";
  if (!task.status || task.status === "created" || task.status === "new") return "已创建";
  return task.status || "已创建";
}

function timestamp(task: Task) {
  const value = task.last_activity_unix ?? task.last_activity ?? task.created_at;
  if (typeof value === "number") return new Date(value < 10_000_000_000 ? value * 1000 : value);
  return value ? new Date(value) : null;
}

function formatDate(value: Date | null) {
  return value && Number.isFinite(value.getTime())
    ? value.toLocaleString("zh-CN", { hour12: false })
    : "暂无记录";
}

export function ArtexTaskListPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await artexApi.tasks();
      const sorted = [...result.tasks].sort((a, b) => {
        const left = timestamp(a)?.getTime() ?? 0;
        const right = timestamp(b)?.getTime() ?? 0;
        return right - left;
      });
      setTasks(sorted);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChanged = () => void load();
    window.addEventListener("artex:tasks-changed", onChanged);
    return () => window.removeEventListener("artex:tasks-changed", onChanged);
  }, [load]);

  useEffect(() => {
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: unknown }>).detail;
      setQuery(typeof detail?.query === "string" ? detail.query : "");
    };
    const onNewTask = () => navigate("/new");
    window.addEventListener("artex:tasks-search", onSearch);
    window.addEventListener("artex:new-task", onNewTask);
    return () => {
      window.removeEventListener("artex:tasks-search", onSearch);
      window.removeEventListener("artex:new-task", onNewTask);
    };
  }, [navigate]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      `${task.id} ${label(task)} ${task.goal ?? ""} ${status(task)}`.toLocaleLowerCase().includes(needle),
    );
  }, [query, tasks]);

  return (
    <div className="cx-page" data-page="artex-task-list">
      {/* 任务清单进侧栏（官方 /scheduled 的 IA：列表在左栏、主区是选中项的会话）。
          行点击直接进会话页；主区只在没有选中项时给一个入口空态。 */}
      <PanelPortal>
        <div aria-label="Focus 任务列表" className="artex-task-list-panel" role="region">
          {loading ? (
            <div className="artex-task-list-state" role="status">
              <Spinner size="sm" />
              <span>加载任务</span>
            </div>
          ) : error ? (
            <div className="artex-task-list-error" role="alert">
              <CodexAlertTriangle size={16} />
              <span>{error}</span>
              <Button aria-label="重试加载任务" onClick={() => void load()} size="sm" uniform variant="ghost">
                <CodexRefresh size={14} />
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="artex-task-list-empty">
              <CodexSearch size={16} />
              <span>{query ? "没有匹配的任务" : "暂无任务"}</span>
            </div>
          ) : (
            <ul className="cx-page__list artex-task-list-rows">
              {visible.map((task) => (
                <li className="cx-row-wrap" key={task.id}>
                  <button
                    className="cx-row artex-task-list-row"
                    onClick={() => navigate(`/task/${encodeURIComponent(task.id)}`)}
                    type="button"
                  >
                    <span aria-hidden className="cx-row__icon">
                      <CodexGrid size={17} />
                    </span>
                    <span className="cx-row__main">
                      <span className="cx-row__title">{label(task)}</span>
                      <span className="cx-row__subtitle">
                        <span
                          className={`artex-task-status artex-task-status--${status(task).toLowerCase()}`}
                        />
                        {status(task)} · {formatDate(timestamp(task))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PanelPortal>

      <SlatePage
        actions={
          <>
            <button
              aria-label="刷新任务"
              className="cx-slate-iconbutton"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              <CodexRefresh size={16} />
            </button>
            <Button onClick={() => navigate("/new")} size="sm" variant="solid">
              新建任务
            </Button>
          </>
        }
        search={{
          id: "task-list-search",
          value: query,
          placeholder: "搜索任务",
          onChange: setQuery,
        }}
        subtitle="Focus 任务会话：左侧选择任务，或新建一个任务。"
        title="任务"
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
            title="无法加载任务"
          />
        ) : loading ? (
          <div className="cx-page__list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }, (_, index) => (
              <div className="cx-row" key={index}>
                <span className="cx-row__icon">
                  <span className="cx-skeleton" style={{ width: 18, height: 18 }} />
                </span>
                <span className="cx-row__main">
                  <span className="cx-skeleton" style={{ width: 220, height: 12 }} />
                  <span className="cx-skeleton" style={{ width: 140, height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            actions={
              <Button onClick={() => navigate("/new")} size="sm" variant="surface">
                新建任务
              </Button>
            }
            description={
              visible.length === 0
                ? query
                  ? "调整搜索条件，或清空搜索。"
                  : "从「新建任务」开始：首条消息会创建 Focus 任务。"
                : "左侧任务列表中的会话会显示在这里；点击任一任务打开它的会话。"
            }
            icon={CodexGrid}
            title={visible.length === 0 ? (query ? "没有匹配的任务" : "暂无任务") : "选择一个任务"}
          />
        )}
      </SlatePage>
    </div>
  );
}
