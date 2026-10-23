import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { artexApi } from "@/artex/api";
import type { Task } from "@/artex/types";
import {
  CodexChatBubble,
  CodexGear,
  type CodexIconProps,
  CodexKeyboard,
  CodexNewChat,
  CodexPlus,
  CodexSearch,
  CodexSidebar,
} from "@/icons";
import type { SettingsNavIcon } from "@/settings/nav-model";
import { SETTINGS_NAV_GROUPS } from "@/settings/nav-model";
import { closeSearchDialog, toggleSearchDialog, useSearchDialog } from "./use-search-dialog";
import { toggleSidebar } from "./use-sidebar";
import "./search-dialog.css";

/**
 * 搜索对话层（⇧ 命令面板）。
 *
 * ⚠️ 数值口径：SPEC §13/§15 明确「command palette（Ctrl+K / Ctrl+\`/\`）未实测」，
 * 所以这里的**结构**照 dsh-codex-ui 的 CodexSidebar 搜索层（scrim + 顶置 dialog +
 * 分组结果 + 键盘导航），**尺寸不是参考端实测值**，属于「官方缺测 → 用可复用的
 * 社区实现兜底」。等参考端补测后替换 .codex-search-dialog 的几何即可，组件契约不变。
 *
 *  - scrim：color-mix(in srgb, #000 48%, transparent)，140ms 淡入
 *  - dialog：水平居中、top 72px、width min(560px, 100%)、radius 16px、padding 10px
 *  - 结果按 Focus 任务 / 设置 / 操作 三类分组，取前 12 条
 *  - 键盘：Esc 关闭、↑↓ 移动、Enter 执行；点 scrim 空白处关闭
 */

interface SearchEntry {
  id: string;
  label: string;
  hint?: string;
  group: "任务" | "设置" | "操作";
  /** 官方图标组件（CodexIconProps）与导航模型里的 SettingsNavIcon（lucide 形）都满足这个形状 */
  icon: SettingsNavIcon | ((props: CodexIconProps) => React.ReactElement);
  run: () => void;
}

function taskLabel(task: Task): string {
  return task.name?.trim() || task.description?.trim() || `任务 ${task.id}`;
}

/**
 * 设置分节（**从设置导航模型直接派生**，不是第二份手抄表）。
 *
 * 出处：`@/settings/nav-model` 的 SETTINGS_NAV_GROUPS —— 官方 18 项里本工程保留的那些
 * （2026-10-14 收敛，逐条理由见 nav-model.ts 注释）。此前这里手抄了一份 14 项清单，
 * 其中 11 项已经不存在（导入/语音/配置/个性化/钩子/连接/代码审查/Git/环境/Worktrees/技能），
 * 搜出来点进去是 404 —— 所以改成从模型派生，删分区只删一处。
 */
const SETTINGS_SECTIONS = SETTINGS_NAV_GROUPS.flatMap((group) =>
  group.items
    .filter((item) => !item.hiddenFromNav && item.to == null)
    .map((item) => ({ id: item.slug, label: item.label, icon: item.icon })),
);

export function SearchDialog() {
  const open = useSearchDialog();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** 对话框根：焦点锁要在它内部循环（行为测试 kb.dialog.tab-focus-trap 报过「第 13 次 Tab 逃出」）。 */
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /** 打开前的焦点位置，关闭时归还 —— 官方模态的语义是「Esc 后焦点回到触发者」。 */
  const restoreRef = useRef<HTMLElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  // 命令分发器（设置 → 键盘快捷键）里的「搜索」命令通过事件打开本层：
  // settings → shell 不直接 import，避免模块环（commands.ts 里派发 codex:open-search）
  useEffect(() => {
    // 与旧的硬编码键位同语义：开着再按就关掉
    const onOpen = () => toggleSearchDialog();
    window.addEventListener("codex:open-search", onOpen);
    return () => window.removeEventListener("codex:open-search", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setTasks([]);
    setTasksError(false);
    setTasksLoading(true);
    void artexApi
      .tasks()
      .then((result) => {
        if (active) setTasks(result.tasks);
      })
      .catch(() => {
        if (active) setTasksError(true);
      })
      .finally(() => {
        if (active) setTasksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    // 打开前记下是谁打开的这一层，关闭时还回去
    restoreRef.current = document.activeElement as HTMLElement | null;
    // 打开后把焦点交给输入框（首帧之后再聚焦，避免 scrim 动画抢焦）
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  /** 统一的关闭入口：先关，再把焦点还给触发者（否则焦点落到 body，键盘用户会丢失位置）。 */
  const close = () => {
    closeSearchDialog();
    const target = restoreRef.current;
    // 触发者可能已经不在文档里（例如路由切换后），聚焦前先确认
    if (target != null && document.contains(target)) target.focus();
  };

  const entries = useMemo<SearchEntry[]>(() => {
    const q = deferredQuery.trim().toLowerCase();
    const match = (text: string) => (q ? text.toLowerCase().includes(q) : true);

    const taskEntries: SearchEntry[] = tasks
      .filter((task) =>
        match(
          [task.name, task.id, task.description, task.goal, task.category_name]
            .filter((value): value is string => Boolean(value))
            .join(" "),
        ),
      )
      .map((task) => ({
        id: `task-${task.id}`,
        label: taskLabel(task),
        hint: task.status || "Focus",
        group: "任务" as const,
        icon: CodexChatBubble,
        run: () => navigate(`/task/${encodeURIComponent(task.id)}`),
      }));

    const taskList: SearchEntry[] = match("Focus 任务 任务列表 查看所有任务 全部任务")
      ? [
          {
            id: "task-list",
            label: "查看所有 Focus 任务",
            hint: "任务列表",
            group: "任务",
            icon: CodexChatBubble,
            run: () => navigate("/function/tasks"),
          },
        ]
      : [];

    const settings: SearchEntry[] = SETTINGS_SECTIONS.filter((s) => match(s.label)).map((s) => ({
      id: `setting-${s.id}`,
      label: s.label,
      hint: "设置",
      group: "设置" as const,
      icon: s.icon,
      run: () => navigate(`/settings/${s.id}`),
    }));

    const actions: SearchEntry[] = [
      {
        id: "action-new-chat",
        label: "新聊天",
        hint: "Ctrl+N",
        group: "操作" as const,
        icon: CodexNewChat,
        run: () => navigate("/new"),
      },
      {
        id: "action-settings",
        label: "打开设置",
        hint: "Ctrl+,",
        group: "操作" as const,
        icon: CodexGear,
        run: () => navigate("/settings/general"),
      },
      {
        id: "action-sidebar",
        label: "显示/隐藏侧边栏",
        hint: "Ctrl+Shift+S",
        group: "操作" as const,
        icon: CodexSidebar,
        run: toggleSidebar,
      },
      {
        id: "action-shortcuts",
        label: "显示键盘快捷键",
        hint: "Ctrl+/",
        group: "操作" as const,
        icon: CodexKeyboard,
        run: () => {},
      },
      {
        id: "action-new-window",
        label: "新建窗口",
        group: "操作" as const,
        icon: CodexPlus,
        run: () => window.dispatchEvent(new CustomEvent("codex:new-window")),
      },
    ].filter((a) => match(a.label));

    return [...taskList, ...taskEntries, ...settings, ...actions].slice(0, 12);
  }, [deferredQuery, navigate, tasks]);

  if (!open) return null;

  // 结果集变化时高亮自动夹回范围内（不需要额外的复位 effect）
  const activeEntryIndex = entries.length ? Math.min(activeIndex, entries.length - 1) : 0;

  const runEntry = (entry: SearchEntry) => {
    entry.run();
    closeSearchDialog();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      // 焦点锁：`aria-modal="true"` 必须名副其实 —— 否则 Tab 会跑到浮层背后的页面上。
      // 语义与官方模态一致（SPEC-OVERLAYS 的 bundle 原文）：Shift+Tab 在首元素回卷到末位，
      // Tab 在末位回卷到首位；焦点若已跑到容器外（比如刚打开时），先拉回首位。
      const root = dialogRef.current;
      if (root == null) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active != null && root.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
        return;
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (entries.length ? (i + 1) % entries.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const entry = entries[activeEntryIndex];
      if (entry) runEntry(entry);
    }
  };

  let renderedGroup = "";

  return (
    <div
      className="codex-search-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        aria-label="搜索"
        aria-modal="true"
        className="codex-search-dialog"
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="codex-search-dialog__field">
          <CodexSearch size={16} />
          <input
            aria-label="搜索 Focus 任务、设置与操作"
            className="codex-search-dialog__input"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索 Focus 任务、设置与操作"
            ref={inputRef}
            value={query}
          />
          <kbd className="codex-search-dialog__kbd">Esc</kbd>
        </div>

        <div className="codex-search-dialog__results">
          {entries.length === 0 ? (
            <div
              aria-live="polite"
              className="codex-search-dialog__empty"
              role={tasksError ? "alert" : "status"}
            >
              {tasksError
                ? "Focus 任务搜索暂不可用，关闭并重新打开搜索可重试。"
                : tasksLoading
                  ? "正在加载 Focus 任务…"
                  : "没有匹配结果"}
            </div>
          ) : (
            <>
              {tasksError ? (
                <div aria-live="assertive" className="codex-search-dialog__empty" role="alert">
                  Focus 任务加载失败，当前只显示设置与操作。
                </div>
              ) : tasksLoading ? (
                <div aria-live="polite" className="codex-search-dialog__empty" role="status">
                  正在加载 Focus 任务…
                </div>
              ) : null}
              {entries.map((entry, index) => {
                const Icon = entry.icon;
                const showGroup = entry.group !== renderedGroup;
                renderedGroup = entry.group;
                return (
                  <div key={entry.id}>
                    {showGroup ? <div className="codex-search-dialog__group">{entry.group}</div> : null}
                    <button
                      className="codex-search-dialog__item"
                      data-active={index === activeEntryIndex}
                      onClick={() => runEntry(entry)}
                      onMouseEnter={() => setActiveIndex(index)}
                      type="button"
                    >
                      <Icon size={16} />
                      <span className="codex-search-dialog__label">{entry.label}</span>
                      {entry.hint ? <span className="codex-search-dialog__hint">{entry.hint}</span> : null}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
