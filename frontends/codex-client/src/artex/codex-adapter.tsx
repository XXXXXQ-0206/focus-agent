import {
  Activity as ActivityIcon,
  BarChart3,
  Boxes,
  FileText,
  ListChecks,
  type LucideIcon,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Popover } from "radix-ui";
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { RuntimeMessage } from "@/chat";
import {
  type ChatStatus,
  Composer,
  type ComposerAttachment,
  ConversationView,
  Markdown,
  useFollowUp,
} from "@/chat";
import {
  CodexArchive,
  CodexBrain,
  CodexCheck,
  CodexChevronRight,
  CodexFileDoc,
  CodexHomeHero,
  type CodexIconProps,
  CodexNewTab,
  CodexPerson,
  CodexRefresh,
  CodexRows,
  CodexShield,
  CodexShieldCheck,
} from "@/icons";
import type { ToolCall } from "@/lib/types";
import { WorkspaceHeader } from "@/shell/WorkspaceHeader";
import { type ArtexAgent, artexApi, openActivityStream } from "./api";
import { useArtexComposerSelection } from "./model-selection";
import { ARTEXTaskTabs, type TaskTabId } from "./task-workbench";
import type {
  Activity,
  Approval,
  ArtexConversation,
  Asset,
  CoverageGraph,
  Finding,
  FindingRetest,
  MainSession,
  Task,
  TaskCoverage,
  TaskLLMResolution,
  TaskNode,
} from "./types";
import "./codex-adapter.css";
import "./task-transcript.css";
import { ARTEX_DEFAULT_MODE, setArtexMode, useArtexMode } from "./use-artex-mode";

function taskLabel(task: Task): string {
  return task.name?.trim() || task.description?.trim() || task.id;
}

/**
 * 模式（agent）→ 官方图标。用户口径：「图标自行选择，但不要重复、要最对应的」（探索菜单那轮），
 * 这里沿用同一标准：一枚一个语义，全部取自 `@/icons` 的官方图形。
 *   auto      → 脑（Auto 自动：由主脑自动判读、自动执行）
 *   pentest   → 盾（安全 / 渗透）
 *   reporter  → 文档（报告撰写）
 *   retester  → 刷新（漏洞复测）
 *   verifier  → 盾勾（漏洞验证）
 *   其他自定义 → 人像（自定义 agent）
 *
 * ★ 2026-10-15（用户：「Auto 模式换一个 logo」）：auto 原来是 `CodexSparkle`（四角火花），
 *   用户要求换掉。新选 **`CodexBrain`**：语义上「自动模式 = 让主 agent 自己判断怎么打」，
 *   且它在全仓**从未被任何界面引用**（只有 icons/reasoning.tsx 里的定义），
 *   与其余四枚模式图标（盾 / 文档 / 刷新 / 盾勾）以及兜底的人像都不重复。
 */
const MODE_ICONS: Record<string, ComponentType<CodexIconProps>> = {
  auto: CodexBrain,
  pentest: CodexShield,
  reporter: CodexFileDoc,
  retester: CodexRefresh,
  verifier: CodexShieldCheck,
};

function modeIconFor(key: string): ComponentType<CodexIconProps> {
  return MODE_ICONS[key] ?? CodexPerson;
}

function activityText(activity: Activity): string {
  return (
    activity.summary ||
    activity.message ||
    activity.content ||
    activity.text ||
    activity.detail ||
    "Focus 活动已更新"
  );
}

interface TaskTranscriptEntry {
  key: string;
  message: RuntimeMessage;
}

function activityCreatedAt(activity: Activity): string {
  const value = activity.ts ?? activity.created_at;
  if (typeof value === "number") {
    return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toISOString();
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function userActivityText(activity: Activity): string {
  if (typeof activity.detail === "string" && activity.detail.trim().startsWith("{")) {
    try {
      const detail = JSON.parse(activity.detail) as { text?: unknown };
      if (typeof detail.text === "string") return detail.text;
    } catch {
      // Older or non-JSON details are still shown through the summary fallback.
    }
  }
  // 2026-10-15：末尾补 `detail` 兜底 —— 有的写入方只填 detail（既不是 JSON 也没有 summary），
  // 只认前四个字段时用户消息会渲染成一个**空气泡**（mock 数据实测复现）。
  return (
    activity.summary ||
    activity.message ||
    activity.content ||
    activity.text ||
    (typeof activity.detail === "string" ? activity.detail : "") ||
    ""
  );
}

function activityToolSummary(activity: Activity, status: ToolCall["status"]): string {
  const tool = activity.tool || "Focus 工具";
  if (!/bash|shell|exec|command|terminal|run/i.test(tool)) return tool;

  let command = "";
  if (typeof activity.detail === "string") {
    try {
      const input = JSON.parse(activity.detail) as Record<string, unknown>;
      const value = input.command ?? input.cmd ?? input.script;
      if (typeof value === "string") command = value;
    } catch {
      command = activity.detail;
    }
  }
  const action =
    status === "running"
      ? "正在运行"
      : status === "error"
        ? "运行失败"
        : status === "pending"
          ? "已停止"
          : "已运行";
  return command ? `${action} ${command}` : `${action} ${tool}`;
}

function toTaskTranscript(
  activities: Activity[],
  taskId: string,
  taskRunning: boolean,
  /**
   * 「正在流式」判定用的 worker 名。
   *   任务会话：主 agent 的 worker 恒为 `mainagent`（server 侧写死）；
   *   模式对话：worker = agent key（server/conversations.go:588 的 emit 带 c.AgentKey）。
   * 最后一条 text/thinking 且出自该 worker、且会话在跑 ⇒ 标记 streaming（打字机光标）。
   */
  streamWorker = "mainagent",
): TaskTranscriptEntry[] {
  const entries: TaskTranscriptEntry[] = [];
  /** tool_use_id → 条目 + 起始时间（算「已在 Ns 内运行」） */
  const toolUses = new Map<string, { entry: TaskTranscriptEntry; startedAt: number }>();
  let lastRenderableIndex = -1;
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const kind = activities[index].kind || activities[index].type;
    if (kind !== "usage") {
      lastRenderableIndex = index;
      break;
    }
  }

  const makeMessage = (
    activity: Activity,
    key: string,
    patch: Partial<RuntimeMessage> & Pick<RuntimeMessage, "role" | "content">,
  ): RuntimeMessage => {
    const { role, content, ...rest } = patch;
    return {
      id: key,
      conversationId: taskId,
      createdAt: activityCreatedAt(activity),
      role,
      content,
      ...rest,
    };
  };

  activities.forEach((activity, index) => {
    const kind = (activity.kind || activity.type || "activity").toLowerCase();
    const key = String(activity.seq ?? activity.id ?? `${taskId}-${index}`);
    if (kind === "usage") return;

    if (kind === "user" || activity.worker === "user") {
      entries.push({
        key,
        message: makeMessage(activity, key, { role: "user", content: userActivityText(activity) }),
      });
      return;
    }

    if (kind === "tool_result") {
      const useId = activity.tool_use_id;
      const existing = useId ? toolUses.get(useId) : undefined;
      const output = activity.detail || activity.summary || "";
      if (existing) {
        const finishedAt = Date.parse(activityCreatedAt(activity));
        const elapsedMs =
          Number.isFinite(finishedAt) && existing.startedAt > 0
            ? Math.max(0, finishedAt - existing.startedAt)
            : undefined;
        existing.entry.message = {
          ...existing.entry.message,
          toolCalls: existing.entry.message.toolCalls?.map((call) =>
            call.id === useId
              ? {
                  ...call,
                  status: activity.is_error ? "error" : "success",
                  output,
                  ...(elapsedMs !== undefined ? { elapsedMs } : {}),
                }
              : call,
          ),
        };
        return;
      }

      const callId = useId || key;
      const call: ToolCall = {
        id: callId,
        name: activity.tool || "Focus 工具",
        summary: activity.tool || "Focus 工具结果",
        status: activity.is_error ? "error" : "success",
        output,
      };
      entries.push({
        key,
        message: makeMessage(activity, key, { role: "assistant", content: "", toolCalls: [call] }),
      });
      return;
    }

    if (kind === "tool_use") {
      const callId = activity.tool_use_id || `${key}-tool`;
      const status: ToolCall["status"] = taskRunning ? "running" : "pending";
      const call: ToolCall = {
        id: callId,
        name: activity.tool || "Focus 工具",
        summary: activityToolSummary(activity, status),
        status,
        // 列表接口不带 detail（详情按需拉）；summary 里带着工具入参 JSON（如 `Bash {"command": …}`），
        // 命令提取靠它（block-adapter 的 commandOf 会剥掉工具名前缀）。
        input: activity.detail || activity.summary,
      };
      const entry = {
        key,
        message: makeMessage(activity, key, { role: "assistant", content: "", toolCalls: [call] }),
      };
      entries.push(entry);
      if (activity.tool_use_id) {
        const startedAt = Date.parse(activityCreatedAt(activity));
        toolUses.set(activity.tool_use_id, {
          entry,
          startedAt: Number.isFinite(startedAt) ? startedAt : 0,
        });
      }
      return;
    }

    if (kind === "thinking") {
      const reasoning = activity.detail || activity.summary || activityText(activity);
      const streaming = taskRunning && index === lastRenderableIndex && activity.worker === streamWorker;
      entries.push({
        key,
        message: makeMessage(activity, key, {
          role: "assistant",
          content: "",
          reasoning,
          streaming,
        }),
      });
      return;
    }

    const content = activity.detail || activity.summary || activityText(activity);
    const streaming =
      kind === "text" && taskRunning && index === lastRenderableIndex && activity.worker === streamWorker;
    entries.push({
      key,
      message: makeMessage(activity, key, {
        role: "assistant",
        content,
        streaming,
        error: activity.is_error
          ? {
              kind: "unknown",
              message: activity.summary || content,
              status: null,
              detail: activity.detail || "",
              retryable: false,
            }
          : undefined,
      }),
    });
  });

  return entries;
}

const TASK_NAV_SECTIONS = [
  { id: "conversation", title: "任务", tabs: ["activity", "sessions", "overview"] },
  { id: "results", title: "执行结果", tabs: ["discovery", "retest", "assets", "coverage"] },
  { id: "audit", title: "审计记录", tabs: ["intercept", "report"] },
] as const satisfies { id: string; title: string; tabs: readonly TaskTabId[] }[];

const TASK_TAB_ICONS: Record<TaskTabId, LucideIcon> = {
  activity: ActivityIcon,
  sessions: Users,
  overview: ListChecks,
  discovery: Search,
  retest: RotateCcw,
  assets: Boxes,
  coverage: BarChart3,
  intercept: ShieldCheck,
  report: FileText,
};

function taskStatusLabel(task: Task): string {
  if (task.paused || task.status === "paused") return "已暂停";
  if (task.queued || task.status === "queued") return "排队中";
  if (task.status === "running" || task.in_flight) return "运行中";
  if (task.status === "done") return "已完成";
  if (task.status === "failed") return "失败";
  return "已创建";
}

/**
 * 输入区的待发送附件（2026-10-20）。图片会先由服务端读图再交给 Agent
 * （norma 的消息模型没有 image 块，见 server/vision.go 的说明）。
 */
function useComposerFiles() {
  const [files, setFiles] = useState<ComposerAttachment[]>([]);
  /**
   * 卸载时清理：remove/clear 已经 revoke 过，但用户带着未发送的图片直接离开页面时
   * 组件没有机会释放 object URL（大图会一直占着内存）。这里读 ref 里的**最新**列表。
   */
  const filesRef = useRef<ComposerAttachment[]>([]);
  filesRef.current = files;
  useEffect(
    () => () => {
      for (const file of filesRef.current) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
    },
    [],
  );
  const addFiles = (incoming: File[]) => {
    setFiles((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        file,
      })),
    ]);
  };
  const removeFile = (id: string) => {
    setFiles((current) => {
      const target = current.find((file) => file.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((file) => file.id !== id);
    });
  };
  const clearFiles = () => {
    setFiles((current) => {
      for (const file of current) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      }
      return [];
    });
  };
  return { files, addFiles, removeFile, clearFiles };
}

export function ArtexHomePage() {
  const navigate = useNavigate();
  const mode = useArtexMode();
  const [modes, setModes] = useState<ArtexAgent[]>([]);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState("");
  // 模式 = agent key：agent 若绑定了档案，芯片应显示那个档案（服务端绑定优先）
  const [modelNotice, setModelNotice] = useState("");
  const selection = useArtexComposerSelection({
    agentKey: mode,
    onError: (message) => setModelNotice(message),
  });
  const composerFiles = useComposerFiles();

  useEffect(() => {
    let active = true;
    void artexApi
      .agents()
      .then((list) => {
        if (!active) return;
        // 「模式」= 对话型 agent：原版站点 chat 页只列 role=assistant 的（Auto / 渗透测试 /
        // 自定义），编排内置（goals/planner/mainagent/worker）不出现在这里 —— 同
        // 迁移前 ARTEX Web 聊天页的 chatAgents 逻辑。
        setModes(list.filter((agent) => agent.role === "assistant" && agent.enabled !== false));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Agent 列表加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  // 存着的模式不在列表里（agent 被删/改名）⇒ 回落 Auto（或列表首项）并写回。
  useEffect(() => {
    if (modes.length === 0 || modes.some((agent) => agent.key === mode)) return;
    const fallback = modes.find((agent) => agent.key === ARTEX_DEFAULT_MODE) ?? modes[0];
    if (fallback) setArtexMode(fallback.key);
  }, [mode, modes]);

  const activeMode = modes.find((agent) => agent.key === mode);
  const modeName = activeMode?.name || (mode === ARTEX_DEFAULT_MODE ? "Auto" : mode);
  const ModeIcon = modeIconFor(mode);

  const send = async (message: string) => {
    if (status === "streaming") return;
    setStatus("streaming");
    setError("");
    try {
      // 原版站点同一条链路（chat/page.tsx:391-401）：先按模式建对话，再把这条消息发进去。
      const created = await artexApi.createConversation(mode);
      try {
        // 附件先落到这次会话的聊天目录（sessions/conv-<id>/uploads），随消息带引用过去。
        const outgoing = composerFiles.files.flatMap((file) => (file.file ? [file.file] : []));
        const attachments = outgoing.length
          ? await artexApi.uploadChatAttachments(
              "session",
              `conv-${created.id}`,
              outgoing,
            )
          : [];
        await artexApi.sendConversationMessage(created.id, message, attachments);
        composerFiles.clearFiles();
      } catch (caught) {
        // 回滚刚建出来的空会话（最常见：后端没配 LLM ⇒ 503，"尚未配置 LLM…"）。
        // 只在**服务端确认这条会话一条消息都没有**时才删 —— 避免把"其实已经收下这条消息"
        // 的会话连运行一起删掉（发送响应丢失的边界）。
        void (async () => {
          try {
            const page = await artexApi.conversationMessages(created.id, 0);
            if (page.items.length === 0) await artexApi.deleteConversation(created.id);
          } catch {
            // 清理是尽力而为，失败不影响错误上报
          }
        })();
        throw caught;
      }
      navigate(`/c/${created.id}`);
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : "消息发送失败";
      // 503「尚未配置 LLM」是环境问题而非交互问题 ⇒ 把该去哪儿配写清楚。
      setError(/LLM/i.test(raw) ? `${raw}（在「系统 → LLM 配置」添加模型配置后重试）` : raw);
    } finally {
      setStatus("idle");
    }
  };

  const stop = () => {
    setStatus("idle");
  };

  return (
    <>
      <WorkspaceHeader
        actions={
          <button aria-label="新建标签页" className="codex-icon-button" type="button">
            <CodexNewTab size={16} />
          </button>
        }
      />
      <div className="cx-home artex-codex-home">
        <div aria-hidden className="cx-home__mode-bar" />
        <div className="cx-home__main">
          <div className="cx-home__layout">
            <div className="cx-home__stage">
              <div className="cx-home__column">
                <div aria-hidden className="cx-home__hero">
                  <CodexHomeHero size={56} />
                </div>
                <h1 className="cx-home__title">我们要构建什么？</h1>
              </div>
            </div>
            <div className="cx-home__composer-area">
              <div className="cx-composer-column">
                <div className="cx-composer-column__spacer" />
                <div className="cx-project-rail artex-task-rail">
                  <div className="cx-project-rail__row">
                    {/*
                      Focus 模式选择器（= Focus 首页「选择项目」芯片那一槽）。
                      形态照官方芯片（28px / r9999 / padding 0 8px / gap 6px / 13px 430），
                      点开是应用同款菜单浮层（.codex-app-menu）：16px 图标 + 名称 + 当前项打勾。
                      这里**不再**内嵌原生 <select>（旧做法把 select 铺满芯片、opacity 0，
                      既拖不出原生菜单、也没法对齐官方菜单行高）。
                    */}
                    <Popover.Root onOpenChange={setModeMenuOpen} open={modeMenuOpen}>
                      <Popover.Trigger asChild>
                        <button
                          aria-label={`切换 Focus 模式，当前 ${modeName}`}
                          className="cx-chip cx-project-rail__chip artex-mode-chip"
                          data-mode-key={mode}
                          type="button"
                        >
                          <ModeIcon size={16} />
                          <span className="cx-chip__value">{modeName}</span>
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          align="start"
                          className="codex-app-menu artex-mode-menu"
                          data-artex-mode-menu=""
                          side="top"
                          sideOffset={8}
                        >
                          {modes.length === 0 ? (
                            <span className="artex-mode-menu__empty">
                              {error ? "模式列表加载失败" : "正在加载模式…"}
                            </span>
                          ) : (
                            modes.map((agent) => {
                              const Icon = modeIconFor(agent.key);
                              const selected = agent.key === mode;
                              return (
                                <button
                                  className="codex-app-menu__item"
                                  data-mode-key={agent.key}
                                  data-selected={selected ? "" : undefined}
                                  key={agent.key}
                                  onClick={() => {
                                    setArtexMode(agent.key);
                                    setModeMenuOpen(false);
                                  }}
                                  title={agent.description || agent.name}
                                  type="button"
                                >
                                  <Icon aria-hidden size={16} />
                                  <span className="codex-app-menu__label">{agent.name}</span>
                                  {agent.builtin === false ? (
                                    <span className="artex-mode-menu__badge">自定义</span>
                                  ) : null}
                                  {selected ? (
                                    <CodexCheck aria-hidden className="artex-mode-menu__check" size={16} />
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                </div>
                <Composer
                  onSend={(message) => void send(message)}
                  onStop={stop}
                  selection={{
                    ...selection,
                    notice: modelNotice,
                    attachments: composerFiles.files,
                    onAddFiles: composerFiles.addFiles,
                    onRemoveAttachment: composerFiles.removeFile,
                  }}
                  status={status}
                />
                {error ? (
                  <p className="artex-codex-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 模式对话页（`/c/:conversationId`）—— 原版站点 `chat` 页会话视图的 Focus 化。
 *
 * 数据链路（三个接口都在 server/server.go:858-867 注册、原版站点同款调用）：
 *   · 元信息：`GET /api/conversations` 列表里按 id 找（后端没有单条 GET，原版也是列表里找）；
 *   · 转录：  `GET /api/conversations/{id}/messages?since=<游标>` →
 *            `{ items: Activity[], cursor, running }`（与任务活动流同一套 Activity DTO，
 *             所以直接复用 `toTaskTranscript` 的映射；worker = agent key）；
 *   · 发送：  `POST /api/conversations/{id}/messages`；停止：`POST /api/conversations/{id}/stop`。
 *
 * 刷新策略：本工程**没有对话级 SSE**（SSE 只服务任务活动流，server.go:822），
 * 所以像原版站点一样轮询 —— 自调度 setTimeout：跑（running=true）时 1.2s，
 * 空闲 5s，出错 4s，页面卸载即停。
 */
export function ArtexConversationPage() {
  const { conversationId: rawId } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const composerFiles = useComposerFiles();
  const [conversation, setConversation] = useState<ArtexConversation | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cursorRef = useRef(0);
  const invalid = !Number.isFinite(id) || id <= 0;
  /**
   * 芯片显示**实际生效**的档案：agent 绑定 → 会话 pin → 全局激活（与 resolveChatAgent 一致）。
   * 在这个会话里换模型 = 写会话 pin（PATCH /conversations/{id}/profile），而不是只切全局。
   */
  const [modelNotice, setModelNotice] = useState("");
  const selection = useArtexComposerSelection({
    pinnedProfileId: conversation?.llm_profile_id ?? null,
    agentKey: conversation?.agent_key,
    onError: (message) => setModelNotice(message),
    onSelectModel: async (profileId) => {
      await artexApi.setConversationProfile(id, profileId);
      setConversation((current) => (current ? { ...current, llm_profile_id: profileId } : current));
    },
  });

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    let timer = 0;
    let seen = 0;

    const tick = async () => {
      try {
        const page = await artexApi.conversationMessages(id, seen);
        if (cancelled) return;
        if (page.items.length > 0) {
          setActivities((current) => {
            const known = new Set(current.map((item) => String(item.seq ?? item.id ?? "")));
            const fresh = page.items.filter((item) => !known.has(String(item.seq ?? item.id ?? "")));
            return fresh.length > 0 ? [...current, ...fresh] : current;
          });
        }
        seen = page.cursor;
        cursorRef.current = page.cursor;
        setRunning(page.running);
        setError("");
        timer = window.setTimeout(() => void tick(), page.running ? 1200 : 5000);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "对话消息加载失败");
        timer = window.setTimeout(() => void tick(), 4000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, invalid]);

  // 元信息（标题 / 模式）只拉一次；列表接口每次都会带最新 running 状态。
  useEffect(() => {
    if (invalid) return;
    let active = true;
    void artexApi
      .conversations()
      .then((list) => {
        if (!active) return;
        setConversation(list.find((item) => item.id === id) ?? null);
      })
      .catch(() => {
        // 列表失败不影响转录本身；标题回落到「模式对话」。
      });
    return () => {
      active = false;
    };
  }, [id, invalid]);

  const send = async (message: string, files?: File[], fromQueue = false) => {
    if (invalid || sending) return;
    setSending(true);
    setError("");
    try {
      const outgoing =
        files ??
        (fromQueue ? [] : composerFiles.files.flatMap((file) => (file.file ? [file.file] : [])));
      const attachments = outgoing.length
        ? await artexApi.uploadChatAttachments(
            "session",
            `conv-${id}`,
            outgoing,
          )
        : [];
      await artexApi.sendConversationMessage(id, message, attachments);
      if (!fromQueue) composerFiles.clearFiles();
      // 立刻拉一次，让用户那条消息不用等下一个轮询周期。
      const page = await artexApi.conversationMessages(id, cursorRef.current);
      setActivities((current) => [...current, ...page.items]);
      cursorRef.current = page.cursor;
      setRunning(page.running);
      window.dispatchEvent(new CustomEvent("artex:conversations-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消息发送失败");
    } finally {
      setSending(false);
    }
  };

  const modeKey = conversation?.agent_key ?? "";
  const modeName = modeKey ? (modeKey === ARTEX_DEFAULT_MODE ? "Auto" : modeKey) : "Focus";
  const ModeIcon = modeIconFor(modeKey);
  const status: ChatStatus = sending || running ? "streaming" : "idle";
  const transcript = useMemo(
    () => toTaskTranscript(activities, `conv-${id}`, running, modeKey || "auto"),
    [activities, id, running, modeKey],
  );
  const title = conversation?.title?.trim()
    ? `${conversation.title.trim()} · ${modeName}`
    : `${modeName} 模式对话`;
  // 「跟进方式」（设置 → 常规）：同一条会话里生成中再发一条 —— 排队 / 引导
  const followUp = useFollowUp(
    status,
    (message, files, fromQueue) => void send(message, files, fromQueue),
    () => {
      void artexApi.stopConversation(id).catch(() => undefined);
    },
    `conversation:${id}`,
  );
  const queueMessage = (message: string) => {
    const files = composerFiles.files.flatMap((file) => (file.file ? [file.file] : []));
    if (followUp.submit(message, files)) composerFiles.clearFiles();
  };

  if (invalid) {
    return (
      <ConversationView
        actions={null}
        emptyText="对话 id 无效。"
        messages={[]}
        onSend={() => undefined}
        onStop={() => undefined}
        status="idle"
        title="Focus 模式对话"
      />
    );
  }

  return (
    <ConversationView
      actions={
        <div className="artex-task-actions">
          <span className="artex-mode-badge" title="当前模式">
            <ModeIcon size={14} />
            {modeName}
          </span>
          <button
            aria-label="返回 Focus 工作台"
            className="codex-icon-button"
            onClick={() => navigate("/new")}
            title="返回工作台"
            type="button"
          >
            <CodexNewTab size={16} />
          </button>
        </div>
      }
      className="artex-codex-conversation"
      composerFooter={
        error ? (
          <p className="artex-codex-error" role="alert">
            {error}
          </p>
        ) : null
      }
      emptyText={loading ? "正在加载对话…" : `向「${modeName}」发送第一条消息开始这次对话。`}
      messages={transcript.map((entry) => entry.message)}
      onSend={queueMessage}
      onStop={() => {
        void artexApi.stopConversation(id).catch(() => undefined);
      }}
      showMessageActions={false}
      steer={followUp.allowSteer}
      status={status}
      selection={{
        ...selection,
        notice: modelNotice,
        attachments: composerFiles.files,
        onAddFiles: composerFiles.addFiles,
        onRemoveAttachment: composerFiles.removeFile,
      }}
      title={title}
      onQueuedEdit={followUp.edit}
      onQueuedRemove={followUp.remove}
      onQueuedSteer={followUp.steer}
      queued={followUp.queued}
    />
  );
}

export function ArtexTaskPage() {
  const { taskId: rawTaskId } = useParams();
  const taskId = rawTaskId ? decodeURIComponent(rawTaskId) : "";
  const navigate = useNavigate();
  const [modelNotice, setModelNotice] = useState("");
  const [taskLLM, setTaskLLM] = useState<TaskLLMResolution | null>(null);
  const taskLLMRequest = useRef(0);
  const reloadTaskLLM = useCallback(async () => {
    const request = ++taskLLMRequest.current;
    if (!taskId) {
      setTaskLLM(null);
      return;
    }
    try {
      const resolution = await artexApi.taskLLMResolution(taskId);
      if (request !== taskLLMRequest.current) return;
      setTaskLLM(resolution.mainagent);
      setModelNotice("");
    } catch (caught) {
      if (request !== taskLLMRequest.current) return;
      setModelNotice(caught instanceof Error ? caught.message : "任务模型解析失败");
    }
  }, [taskId]);

  useEffect(() => {
    taskLLMRequest.current += 1;
    setTaskLLM(null);
    setModelNotice("");
  }, [taskId]);

  useEffect(() => {
    void reloadTaskLLM();
    const onChanged = () => void reloadTaskLLM();
    window.addEventListener("artex:llm-changed", onChanged);
    window.addEventListener("artex:tasks-changed", onChanged);
    return () => {
      window.removeEventListener("artex:llm-changed", onChanged);
      window.removeEventListener("artex:tasks-changed", onChanged);
    };
  }, [reloadTaskLLM]);

  const taskModelLocked =
    taskLLM == null || taskLLM.source === "task_chain" || taskLLM.source === "agent_binding";
  const taskModelLockedReason =
    taskLLM == null
      ? "正在解析任务实际使用的模型"
      : taskLLM.source === "task_chain"
        ? "该任务使用独立模型链，请在上层任务配置中修改"
        : taskLLM.source === "agent_binding"
          ? "该 Agent 已绑定模型，请在「Agent 运行」里修改绑定"
          : undefined;

  const selection = useArtexComposerSelection({
    agentKey: "mainagent",
    resolvedProfileId: taskLLM?.profile_id ?? null,
    resolvedModelLabel: taskLLM?.model,
    modelLocked: taskModelLocked,
    modelLockedReason: taskModelLockedReason,
    onError: (message) => setModelNotice(message),
    onSelectModel: async (profileId) => {
      await artexApi.activateLLMProfile(profileId);
      await reloadTaskLLM();
    },
  });
  const [task, setTask] = useState<Task | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<TaskTabId>("activity");
  const [activitySession, setActivitySession] = useState("main");
  const [sessions, setSessions] = useState<MainSession[]>([]);
  const [currentMainSession, setCurrentMainSession] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [retests, setRetests] = useState<FindingRetest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetTotal, setAssetTotal] = useState(0);
  const [coverage, setCoverage] = useState<TaskCoverage | null>(null);
  const [coverageGraph, setCoverageGraph] = useState<CoverageGraph | null>(null);
  const [graphEdgeCount, setGraphEdgeCount] = useState(0);
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [report, setReport] = useState("");
  const [tabLoading, setTabLoading] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState("");
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    setActiveTab("activity");
    setActivitySession("main");
    setTaskPanelOpen(false);
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    let closed = false;
    let closeStream: (() => void) | undefined;
    setTask(null);
    setActivities([]);
    setError("");
    const appendActivity = (event: MessageEvent<string>) => {
      if (closed) return;
      try {
        const parsed = JSON.parse(event.data) as Activity;
        setActivities((items) => [...items.slice(-199), parsed]);
      } catch {
        setActivities((items) => [...items.slice(-199), { message: event.data }]);
      }
    };
    const load = async () => {
      try {
        const [result, history, mainSessionResult] = await Promise.all([
          artexApi.task(taskId),
          artexApi.activityHistory(taskId, activitySession),
          artexApi.mainSessions(taskId),
        ]);
        if (closed) return;
        setTask(result);
        setSessions(mainSessionResult.sessions);
        setCurrentMainSession(mainSessionResult.current);
        setActivities(history.items ?? []);
        if (activitySession === "main") {
          const latest = history.snapshot_cursor ?? history.items?.at(-1)?.seq;
          const close = await openActivityStream(
            taskId,
            (event) => {
              try {
                const activity = JSON.parse(event.data) as Activity;
                if (
                  activity.worker === "mainagent" &&
                  activity.main_seg !== undefined &&
                  activity.main_seg !== mainSessionResult.current
                )
                  return;
              } catch {
                // Keep non-JSON stream payloads visible as activity text.
              }
              appendActivity(event);
            },
            () => undefined,
            typeof latest === "number" ? latest : undefined,
          );
          closeStream = close;
          if (closed) close();
        }
      } catch (caught) {
        if (!closed) setError(caught instanceof Error ? caught.message : "任务加载失败");
      }
    };
    void load();
    return () => {
      closed = true;
      closeStream?.();
    };
  }, [taskId, activitySession]);

  useEffect(() => {
    if (!taskId || activeTab === "activity") return;
    let cancelled = false;
    setTabLoading(true);
    const load = async () => {
      try {
        if (activeTab === "sessions") {
          const [result, workerResult] = await Promise.all([
            artexApi.mainSessions(taskId),
            artexApi.intents(taskId),
          ]);
          if (!cancelled) {
            setSessions(result.sessions);
            setCurrentMainSession(result.current);
            setNodes(workerResult);
          }
        } else if (activeTab === "overview") {
          const result = await artexApi.task(taskId);
          if (!cancelled) setTask(result);
        } else if (activeTab === "discovery") {
          const [findingResult, nodeResult, graphResult] = await Promise.all([
            artexApi.taskFindings(taskId),
            artexApi.intents(taskId),
            artexApi.explorationGraph(taskId),
          ]);
          if (!cancelled) {
            setFindings(findingResult);
            setNodes(nodeResult);
            setGraphEdgeCount(graphResult.edges.length);
          }
        } else if (activeTab === "retest") {
          const findingResult = await artexApi.taskFindings(taskId);
          const retestResult = await Promise.all(
            findingResult.map((finding) =>
              finding.finding_id
                ? artexApi.findingRetests(finding.finding_id).catch(() => [])
                : Promise.resolve([]),
            ),
          );
          if (!cancelled) {
            setFindings(findingResult);
            setRetests(retestResult.flat());
          }
        } else if (activeTab === "assets") {
          const result = await artexApi.taskAssets(taskId);
          if (!cancelled) {
            setAssets(result.assets);
            setAssetTotal(result.total);
          }
        } else if (activeTab === "coverage") {
          const [result, graph] = await Promise.all([
            artexApi.taskCoverage(taskId),
            artexApi.taskCoverageGraph(taskId),
          ]);
          if (!cancelled) {
            setCoverage(result);
            setCoverageGraph(graph);
          }
        } else if (activeTab === "intercept") {
          const result = await artexApi.approvals();
          if (!cancelled) setApprovals(result.filter((approval) => approval.task_id === taskId));
        } else if (activeTab === "report") {
          const result = await artexApi.taskReport(taskId);
          if (!cancelled) setReport(result);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Focus 数据加载失败");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, taskId]);

  const send = async (message: string) => {
    if (activitySession !== "main") {
      setError("当前查看的是历史会话。切回当前主 Agent 会话后才能发送消息。");
      return;
    }
    setStatus("streaming");
    setError("");
    try {
      await artexApi.chat(taskId, message);
      window.dispatchEvent(new CustomEvent("artex:tasks-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消息发送失败");
    } finally {
      setStatus("idle");
    }
  };

  const controlTask = async (action: "pause" | "resume") => {
    setControlBusy(true);
    setError("");
    try {
      const result = await artexApi.controlTask(taskId, action);
      setTask((current) =>
        current
          ? { ...current, paused: result.paused, queued: result.queued, status: result.status }
          : current,
      );
      window.dispatchEvent(new CustomEvent("artex:tasks-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务控制失败");
    } finally {
      setControlBusy(false);
    }
  };

  const archiveTask = async () => {
    if (!window.confirm("归档此任务？任务记录将从活动列表移入归档。")) return;
    setControlBusy(true);
    setError("");
    try {
      await artexApi.archiveTask(taskId);
      window.dispatchEvent(new CustomEvent("artex:tasks-changed"));
      navigate("/function/tasks");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务归档失败");
    } finally {
      setControlBusy(false);
    }
  };

  const title = useMemo(() => (task ? taskLabel(task) : "Focus 任务"), [task]);
  const statusLabel = task ? taskStatusLabel(task) : "正在加载";
  /**
   * 任务在跑 ⇒ 会话态就是 streaming（用户 2026-10-15 的官方截图口径）：
   *   · 转录末尾会出现「正在思考」（ConversationView 的 .cx-thread__pending）；
   *   · 输入区显示停止键而不是发送键。
   * 此前这里只认 send() 那几百毫秒的 sending，任务在后台跑的时候界面显示"空闲" ——
   * 与同一页面 taskStatusLabel() 把 running / in_flight 读成「运行中」自相矛盾。
   */
  const taskRunning = Boolean(task && (task.status === "running" || task.in_flight));
  const chatStatus: ChatStatus = status === "streaming" || taskRunning ? "streaming" : "idle";
  /**
   * 任务页的「跟进 / 排队」执行器。挂在 **chatStatus**（含 taskRunning）而不是局部 sending 上：
   * 任务在跑时再发一条 → 应当进入排队（官方排队行那种），而不是被后端当场拒掉或抢先发出去。
   */
  const stopTask = () => {
    void artexApi.stopChat(taskId).catch(() => undefined);
    setStatus("idle");
  };
  const followUp = useFollowUp(
    chatStatus,
    (message) => void send(message),
    stopTask,
    `task:${taskId}`,
  );
  const transcript = useMemo(
    () => toTaskTranscript(activities, taskId, taskRunning),
    [activities, taskId, taskRunning],
  );
  const rawActivityDetails = useMemo(() => JSON.stringify(activities, null, 2), [activities]);

  return (
    <ConversationView
      className="artex-codex-conversation"
      actions={
        <div className="artex-task-actions">
          <button
            aria-label={task?.paused ? "继续任务" : "暂停任务"}
            className="codex-icon-button"
            disabled={controlBusy || !task}
            onClick={() => void controlTask(task?.paused ? "resume" : "pause")}
            title={task?.paused ? "继续任务" : "暂停任务"}
            type="button"
          >
            {task?.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            aria-label="归档任务"
            className="codex-icon-button"
            disabled={controlBusy || !task}
            onClick={() => void archiveTask()}
            title="归档任务"
            type="button"
          >
            <CodexArchive size={16} />
          </button>
          <button
            aria-label={taskPanelOpen ? "关闭任务面板" : "打开任务面板"}
            aria-pressed={taskPanelOpen}
            className="codex-icon-button"
            onClick={() => setTaskPanelOpen((open) => !open)}
            title={taskPanelOpen ? "关闭任务面板" : "打开任务面板"}
            type="button"
          >
            <CodexRows size={16} />
          </button>
          <button
            aria-label="返回 Focus 工作台"
            className="codex-icon-button"
            onClick={() => navigate("/new")}
            type="button"
          >
            <CodexNewTab size={16} />
          </button>
        </div>
      }
      contentFooter={
        activeTab === "activity" && transcript.length > 0 ? (
          <details className="artex-task-transcript__raw">
            {/* 官方转录里的入口是**一行素行**：16px 图标 + 13px 文字 + 行尾展开箭头，
                没有卡片描边/底色（用户 2026-10-15 的官方截图口径，样式见 task-transcript.css）。 */}
            <summary>
              <CodexRows aria-hidden className="artex-task-transcript__raw-icon" size={16} />
              <span className="artex-task-transcript__label">
                查看原始 Focus 事件 · {activities.length}
              </span>
              <CodexChevronRight aria-hidden className="artex-task-transcript__chevron" size={16} />
            </summary>
            <pre>{rawActivityDetails}</pre>
          </details>
        ) : null
      }
      composerFooter={
        error ? (
          <p className="artex-codex-error" role="alert">
            {error}
          </p>
        ) : null
      }
      emptyText={error ? "无法加载 Focus 任务活动。" : "等待 Focus 活动流返回任务进展。"}
      main={
        activeTab !== "activity" ? (
          <TaskWorkbenchPanel
            activeTab={activeTab}
            approvals={approvals}
            assets={assets}
            assetTotal={assetTotal}
            coverage={coverage}
            coverageGraph={coverageGraph}
            graphEdgeCount={graphEdgeCount}
            findings={findings}
            nodes={nodes}
            currentMainSession={currentMainSession}
            onStartRetest={async (findingId) => {
              try {
                const result = await artexApi.startFindingRetest(findingId);
                setRetests((current) => [
                  result.retest,
                  ...current.filter((item) => item.id !== result.retest.id),
                ]);
                setError("");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "启动复测失败");
              }
            }}
            onSelectSession={(session) => {
              setActivitySession(session);
              setActiveTab("activity");
              setTaskPanelOpen(false);
            }}
            report={report}
            retests={retests}
            sessions={sessions}
            tabLoading={tabLoading}
            task={task}
          />
        ) : null
      }
      messages={transcript.map((entry) => entry.message)}
      onSend={followUp.submit}
      onStop={stopTask}
      panel={
        taskPanelOpen ? (
          <TaskNavigationPanel
            activeTab={activeTab}
            onSelect={(tab) => {
              setActiveTab(tab);
              setTaskPanelOpen(tab !== "activity");
            }}
            title={title}
          />
        ) : null
      }
      showMessageActions={false}
      steer={followUp.allowSteer}
      status={chatStatus}
      selection={{ ...selection, notice: modelNotice }}
      title={`${title} · ${statusLabel}`}
      onQueuedEdit={followUp.edit}
      onQueuedRemove={followUp.remove}
      onQueuedSteer={followUp.steer}
      queued={followUp.queued}
    />
  );
}

function TaskNavigationPanel({
  activeTab,
  onSelect,
  title,
}: {
  activeTab: TaskTabId;
  onSelect: (tab: TaskTabId) => void;
  title: string;
}) {
  return (
    <aside aria-label={`任务面板 · ${title}`} className="cx-artifact artex-task-panel">
      <div className="cx-artifact__card">
        <div className="cx-artifact__sections">
          {TASK_NAV_SECTIONS.map((section) => (
            <section className="cx-artifact__section" key={section.id}>
              <header className="cx-artifact__head">{section.title}</header>
              <div className="cx-artifact__rows">
                <div className="cx-artifact__rows-inner">
                  {section.tabs.map((tabId) => {
                    const tab = ARTEXTaskTabs.find((item) => item.id === tabId);
                    const Icon = TASK_TAB_ICONS[tabId];
                    return (
                      <button
                        aria-current={activeTab === tabId ? "page" : undefined}
                        className="cx-artifact__row artex-task-panel__tab"
                        data-active={activeTab === tabId}
                        key={tabId}
                        onClick={() => onSelect(tabId)}
                        type="button"
                      >
                        <Icon aria-hidden className="cx-artifact__row-icon" size={16} />
                        <span className="cx-artifact__row-label">{tab?.label ?? "任务视图"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TaskWorkbenchPanel({
  activeTab,
  approvals,
  assets,
  assetTotal,
  coverage,
  coverageGraph,
  graphEdgeCount,
  findings,
  nodes,
  currentMainSession,
  onStartRetest,
  onSelectSession,
  report,
  retests,
  sessions,
  tabLoading,
  task,
}: {
  activeTab: TaskTabId;
  approvals: Approval[];
  assets: Asset[];
  assetTotal: number;
  coverage: TaskCoverage | null;
  coverageGraph: CoverageGraph | null;
  graphEdgeCount: number;
  findings: Finding[];
  nodes: TaskNode[];
  currentMainSession: number;
  onStartRetest: (findingId: string) => void;
  onSelectSession: (session: string) => void;
  report: string;
  retests: FindingRetest[];
  sessions: MainSession[];
  tabLoading: boolean;
  task: Task | null;
}) {
  if (tabLoading)
    return (
      <section className="artex-workbench">
        <p className="cx-thread__empty">正在加载 Focus 数据...</p>
      </section>
    );
  if (activeTab === "sessions")
    return (
      <section className="artex-workbench">
        <h2>任务会话</h2>
        {sessions.map((session) => (
          <button
            className="artex-workbench__row"
            key={session.seq}
            onClick={() =>
              onSelectSession(session.seq === currentMainSession ? "main" : `main:${session.seq}`)
            }
            type="button"
          >
            <strong>
              会话 {session.seq}
              {session.seq === currentMainSession ? " · 当前" : ""}
            </strong>
            <span>{session.created_at || "原始会话"}</span>
          </button>
        ))}
        <button className="artex-workbench__row" onClick={() => onSelectSession("plan")} type="button">
          <strong>Planner</strong>
          <span>规划会话</span>
        </button>
        {nodes.map((node) => (
          <button
            className="artex-workbench__row"
            key={`worker-${node.id}`}
            onClick={() => onSelectSession(`intent:${node.id}`)}
            type="button"
          >
            <strong>Worker #{node.id}</strong>
            <span>
              {node.state} · {node.payload || "探索意图"}
            </span>
          </button>
        ))}
      </section>
    );
  if (activeTab === "overview")
    return (
      <section className="artex-workbench">
        <h2>任务总览</h2>
        <dl className="artex-workbench__facts">
          <dt>描述</dt>
          <dd>{task?.description || "—"}</dd>
          <dt>目标</dt>
          <dd>{task?.goal || "—"}</dd>
          <dt>状态</dt>
          <dd>{task ? taskStatusLabel(task) : "—"}</dd>
          <dt>探索进度</dt>
          <dd>
            {task?.goals_met ?? 0}/{task?.goals_total ?? 0} 个目标完成 · {task?.in_flight ?? 0} 个 Worker
            运行中
          </dd>
          <dt>覆盖度</dt>
          <dd>{task?.coverage_enabled === false ? "已关闭" : "已启用"}</dd>
        </dl>
      </section>
    );
  if (activeTab === "discovery")
    return (
      <section className="artex-workbench">
        <h2>发现与探索</h2>
        <p>
          发现 {findings.length} 条 · Worker 意图 {nodes.length} 个 · 探索图连线 {graphEdgeCount} 条
        </p>
        {findings.length === 0 ? (
          <p className="artex-workbench__muted">此任务尚无发现。</p>
        ) : (
          findings.map((finding) => (
            <article className="artex-workbench__row" key={finding.id}>
              <strong>{finding.name || finding.vulnclass}</strong>
              <span>
                {finding.severity} · {finding.status} · {finding.summary}
              </span>
            </article>
          ))
        )}
        <div className="artex-workbench__node-list">
          {nodes.slice(0, 50).map((node) => (
            <article className="artex-workbench__row" key={`intent-${node.id}`}>
              <strong>{node.payload || `探索意图 #${node.id}`}</strong>
              <span>
                {node.state} · 优先级 {node.priority}
                {node.inherited ? ` · 来源任务 ${node.source_task_id || "未知"}` : ""}
              </span>
            </article>
          ))}
        </div>
        {nodes.length > 50 ? <p className="artex-workbench__muted">当前展示最近 50 条意图。</p> : null}
      </section>
    );
  if (activeTab === "retest")
    return (
      <section className="artex-workbench">
        <h2>漏洞复测</h2>
        <p>已读取 {retests.length} 条复测记录</p>
        {findings.map((finding) => (
          <article className="artex-workbench__row" key={finding.id}>
            <span>
              <strong>{finding.name || finding.vulnclass}</strong>
              <small>
                {finding.severity} · {finding.status}
              </small>
            </span>
            {finding.finding_id ? (
              <button
                className="artex-workbench__action"
                onClick={() => onStartRetest(finding.finding_id || finding.id)}
                type="button"
              >
                发起复测
              </button>
            ) : (
              <span className="artex-workbench__muted">尚未登记为可复测漏洞</span>
            )}
          </article>
        ))}
        {retests.map((retest) => (
          <article className="artex-workbench__row" key={`retest-${retest.id}`}>
            <strong>复测 #{retest.id}</strong>
            <span>
              {retest.status} · {retest.verdict || retest.summary || "等待结论"}
            </span>
          </article>
        ))}
      </section>
    );
  if (activeTab === "assets")
    return (
      <section className="artex-workbench">
        <h2>任务资产</h2>
        <p>
          显示 {assets.length} / {assetTotal} 个资产
        </p>
        {assets.map((asset) => (
          <article className="artex-workbench__row" key={asset.id}>
            <strong>{asset.url || asset.domain || asset.ip || `资产 #${asset.id}`}</strong>
            <span>
              {asset.type}
              {asset.port ? ` · ${asset.port}` : ""}
            </span>
          </article>
        ))}
      </section>
    );
  if (activeTab === "coverage")
    return (
      <section className="artex-workbench">
        <h2>资产覆盖</h2>
        <p>
          {coverage?.enabled
            ? `${coverage.tested}/${coverage.denominator} 已测试${coverage.pct == null ? "" : ` · ${coverage.pct}%`}`
            : "覆盖度未启用"}
        </p>
        {coverage?.enabled && coverage.denominator > 0 ? (
          <div
            aria-label="资产测试覆盖度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.max(0, Math.min(100, coverage.pct ?? 0))}
            className="artex-workbench__progress"
            role="progressbar"
          >
            <span style={{ width: `${Math.max(0, Math.min(100, coverage.pct ?? 0))}%` }} />
          </div>
        ) : null}
        <span className="artex-workbench__muted">
          覆盖图节点 {coverageGraph?.nodes.length ?? 0} 个 · 连线 {coverageGraph?.edges.length ?? 0} 条
        </span>
        <div className="artex-workbench__chips">
          {coverage?.by_type.map((row) => (
            <span key={row.type}>
              {row.type}: {row.tested}/{row.total}
            </span>
          ))}
        </div>
        <div className="artex-workbench__node-list">
          {coverageGraph?.nodes.slice(0, 100).map((node) => (
            <article className="artex-workbench__row" key={node.key}>
              <strong>{node.label}</strong>
              <span>
                {node.kind} · {node.in_scope ? "范围内" : "关联节点"} · {node.tested ? "已测试" : "未测试"}
              </span>
            </article>
          ))}
        </div>
        {(coverageGraph?.nodes.length ?? 0) > 100 ? (
          <p className="artex-workbench__muted">当前展示前 100 个覆盖图节点。</p>
        ) : null}
      </section>
    );
  if (activeTab === "intercept")
    return (
      <section className="artex-workbench">
        <h2>拦截审批</h2>
        {approvals.length === 0 ? (
          <p className="artex-workbench__muted">当前任务没有待审批请求。</p>
        ) : (
          approvals.map((approval) => (
            <article className="artex-workbench__row" key={approval.id}>
              <strong>{approval.tool_name}</strong>
              <span>
                {approval.agent_name} · {approval.reason || "等待决定"}
              </span>
            </article>
          ))
        )}
      </section>
    );
  return (
    <section className="artex-workbench">
      <h2>任务报告</h2>
      {report ? (
        <Markdown className="artex-workbench__report" content={report} />
      ) : (
        <p className="artex-workbench__muted">报告为空。</p>
      )}
    </section>
  );
}
