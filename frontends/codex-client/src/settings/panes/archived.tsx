import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { artexApi } from "@/artex/api";
import type { ArtexTaskArchive } from "@/artex/types";
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
} from "./pane-kit";

/**
 * 归档（官方 slug archived-chats）—— 本工程重做成 **Focus 任务归档列表**。
 *
 * 官方这页是 ChatGPT 的「已归档聊天 / 归档所有聊天 / 导出数据」；本工程没有账号域，
 * 但 Focus 有真实的冷归档：任务被压成归档包后从活动列表移走，
 * `GET /api/task-archives` 列出来，`/{id}/restore` 恢复、`DELETE /{id}` 删除
 * （server/server.go:734-741）。所以这一页就是它的 Focus 风格界面：
 *   · 列表：任务名 + 原文描述、归档状态/进度、压缩前后体积、归档时间；
 *   · 行内动作：**恢复**（restore，回到活动任务列表）与**删除**（确认框，不可逆）；
 *   · 顶部搜索框按「任务名 / 描述 / 目标」过滤（服务端 ?q=，输入 300ms 去抖）。
 *
 * 状态与进度是服务端真值，页面**不做任何本地影子状态**。
 */

/**
 * 归档状态 → 中文。取值逐条对齐 db/task_archives.go:29-38 的状态常量。
 * ⚠️ **归档完成态是 `ready`，不是 `archived`** —— 2026-10-14 用真机生命周期试出来的
 * （pause → archive 之后列表里 state=ready，体积 5222 → 1869）。
 */
const STATE_LABELS: Record<string, string> = {
  archive_queued: "排队归档",
  archiving: "归档中",
  archive_failed: "归档失败",
  ready: "已归档",
  restore_queued: "排队恢复",
  restoring: "恢复中",
  restore_failed: "恢复失败",
  delete_queued: "排队删除",
  deleting: "删除中",
  delete_failed: "删除失败",
};

/** 可以执行「恢复 / 删除」的稳定态（排队中、进行中的状态不允许操作） */
const SETTLED_STATES = new Set(["ready", "restore_failed", "delete_failed"]);

function isSettled(state: string): boolean {
  return SETTLED_STATES.has(state);
}

function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("zh-CN", { hour12: false });
}

export function ArchivedPane({ section }: SettingsPaneProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ArtexTaskArchive[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const page = await artexApi.taskArchives(search, "", 0, 200);
      setItems(page.items);
      setTotal(page.total);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法加载任务归档");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 300);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const restore = async (item: ArtexTaskArchive) => {
    setBusyId(item.id);
    try {
      await artexApi.restoreTaskArchive(item.id);
      await load(query);
      window.dispatchEvent(new CustomEvent("artex:tasks-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "恢复归档失败");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: ArtexTaskArchive) => {
    setBusyId(item.id);
    try {
      await artexApi.deleteTaskArchive(item.id);
      await load(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除归档失败");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = useMemo(() => items.filter((item) => !isSettled(item.state)).length, [items]);

  return (
    <PaneShell
      actions={
        <Button color="secondary" onClick={() => void load(query)} size="sm" variant="soft">
          刷新
        </Button>
      }
      lede="已归档的 Focus 任务：归档包在服务端，可恢复回活动列表或删除。"
      section={section}
      title="归档"
    >
      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load(query)} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="无法加载任务归档"
          tone="danger"
        />
      ) : null}

      <PaneSection
        description={
          loading
            ? "正在读取归档列表…"
            : `${String(items.length)} / ${String(total)} 条${pendingCount > 0 ? `（${String(pendingCount)} 条正在归档/恢复）` : ""}`
        }
        title="已归档任务"
      >
        <div className="cx-pane__search">
          <Input
            aria-label="搜索归档任务"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按任务名、描述或目标搜索"
            value={query}
          />
        </div>
        <PaneCard>
          {loading && items.length === 0 ? (
            <PaneEmpty description="正在读取 Focus 的任务归档。" title="正在加载…" />
          ) : items.length === 0 ? (
            <PaneEmpty
              description={
                query.trim()
                  ? "没有匹配的归档。换个关键词，或清空搜索框。"
                  : "在任务页归档一个任务后，它会出现在这里。"
              }
              title={query.trim() ? "没有匹配的归档" : "尚无归档任务"}
            />
          ) : (
            items.map((item) => (
              <PaneRow
                description={
                  <span>
                    {stateLabel(item.state)}
                    {item.progress > 0 && !isSettled(item.state) ? ` ${String(item.progress)}%` : ""}
                    {" · "}
                    {item.task_description?.trim() || item.task_goal?.trim() || "无描述"}
                    {" · "}
                    {formatSize(item.original_size)} → {formatSize(item.compressed_size)}
                    {" · "}
                    {formatTime(item.archived_at ?? item.requested_at)}
                    {item.error ? ` · 失败：${item.error}` : ""}
                  </span>
                }
                key={item.id}
                label={
                  item.task_name?.trim() || item.task_description?.trim() || `任务 ${String(item.task_id)}`
                }
                control={
                  <div className="cx-pane__row-actions">
                    <Button
                      color="secondary"
                      disabled={busyId === item.id}
                      onClick={() => navigate(`/task/${String(item.task_id)}`)}
                      size="sm"
                      variant="ghost"
                    >
                      查看
                    </Button>
                    <Button
                      color="secondary"
                      disabled={busyId === item.id || !isSettled(item.state)}
                      onClick={() => void restore(item)}
                      size="sm"
                      variant="soft"
                    >
                      恢复
                    </Button>
                    <PaneConfirmAction
                      confirmLabel="删除"
                      danger
                      description="归档包会被永久删除，其中的任务数据不可再恢复。"
                      onConfirm={() => void remove(item)}
                      title={`删除任务「${item.task_name || String(item.task_id)}」的归档？`}
                      trigger={
                        <Button
                          color="danger"
                          disabled={busyId === item.id || !isSettled(item.state)}
                          size="sm"
                          variant="ghost"
                        >
                          删除
                        </Button>
                      }
                    />
                  </div>
                }
              />
            ))
          )}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
