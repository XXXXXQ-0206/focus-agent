import type { SystemLogLine } from "@/settings/system-pages-model";
import { clearAccessToken, getAccessToken, refreshAccessToken, setAccessToken } from "./auth";
import {
  findingDetailPath,
  findingLineagePath,
  findingTrafficDetailPath,
  findingTrafficPath,
  normalizeTrafficPage,
  type TrafficPage,
  trafficExchangePath,
  trafficPath,
} from "./operations";
import type { SseMessage, TicketedEventSource } from "./sse";
import { connectTicketedEventStream } from "./sse";
import { streamOriginFor } from "./stream-origin";
import type {
  Activity,
  ActivityHistory,
  Approval,
  ArtexConversation,
  ArtexTaskArchive,
  Asset,
  AuthStatus,
  AutoAllowState,
  ChatResponse,
  CommandRecord,
  ConversationTokenSummary,
  CoverageGraph,
  Credential,
  DashboardStats,
  Finding,
  FindingLineage,
  FindingPage,
  FindingRetest,
  FindingStats,
  FindingTraffic,
  ChatAttachment,
  FindingTrafficDetail,
  InterceptApprovalRow,
  InterceptRule,
  IntranetTopology,
  JudgeConfig,
  LLMPoolStatus,
  LLMProfile,
  LLMRecordDetail,
  LLMRecordItem,
  LLMRetryPolicy,
  LLMTask,
  MainSession,
  MCPServer,
  MCPTool,
  MissingSkill,
  SessionExecResult,
  SessionFsEntry,
  SessionReadResult,
  SessionTokenUsage,
  ShellSession,
  SkillCall,
  SkillItem,
  SSProject,
  SSTask,
  Task,
  TaskCoverage,
  TaskLLMResolution,
  TaskNode,
  TaskSteerResult,
  TaskSteerStatus,
  TokenTotal,
  TokenUsage,
  ToolDefinition,
  ToolStat,
  TrafficDetail,
  TunnelInfo,
  UsageStats,
  WorkspaceFile,
  WorkspaceListing,
} from "./types";

export class ArtexApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ArtexApiError";
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  } catch {
    // Fall back to the HTTP status when the body is not JSON.
  }
  return `${response.status} ${response.statusText}`.trim();
}

async function request<T>(
  path: string,
  init?: RequestInit,
  retried = false,
  responseType: "json" | "text" | "blob" = "json",
): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshAccessToken()) return request<T>(path, init, true, responseType);
    clearAccessToken();
    // Let the top-level auth gate replace the current shell immediately. This
    // avoids leaving a stale-token shell mounted after the first protected API
    // request fails, while keeping auth/login failures local to their form.
    if (typeof window !== "undefined") window.dispatchEvent(new Event("artex:auth-expired"));
    throw new ArtexApiError("登录已过期", 401);
  }
  if (!response.ok) throw new ArtexApiError(await errorMessage(response), response.status);
  if (response.status === 204) return undefined as T;
  if (responseType === "text") return (await response.text()) as T;
  if (responseType === "blob") return (await response.blob()) as T;
  return (await response.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export interface ArtexSystemSettings {
  traffic_capture: boolean;
  agent_traffic_binding: boolean;
  llm_record?: boolean;
  web_search_enabled: boolean;
  web_search_backend: string;
  brave_key_set: boolean;
  tavily_key_set: boolean;
  web_search_proxy?: string;
  global_proxy?: string;
  python_interpreter?: string;
  workers?: number;
  constraints_inject_planner?: boolean;
  constraints_inject_worker?: boolean;
  task_concurrency_enabled?: boolean;
  task_concurrency_limit?: number;
  llm_pool_enabled?: boolean;
  llm_pool_bind_fallback?: boolean;
}

export type ArtexAgent = Record<string, unknown> & {
  key: string;
  name: string;
  description?: string;
  role?: string;
  builtin?: boolean;
  enabled?: boolean;
  /** 绑定的 LLM 档案（agent 绑定优先于会话 pin 与全局激活） */
  llm_profile_id?: number | null;
  mcp_count?: number;
  skill_count?: number;
  tool_count?: number;
};

export interface ArtexAgentDetail {
  agent: ArtexAgent;
  prompt: string;
  variables?: Array<{ name: string; description: string; example: string; source: string }>;
  versions?: Array<{ version: number; ts: string; note: string; template_text: string }>;
  visibility?: { mcp: number[]; skill: string[] };
  llm_profiles?: Array<{ id: number; name: string; model: string; is_default: boolean }>;
  wrapup_prompt?: string;
  wrapup_default?: string;
  task_timeout_wrapup_prompt?: string;
  task_timeout_wrapup_default?: string;
}

export interface ArtexLogHistory {
  items: SystemLogLine[];
  has_more: boolean;
}

export interface ArtexRecentLogs {
  items: SystemLogLine[];
  cursor: number;
}

export const artexApi = {
  health: () => get<{ ok: boolean; service: string; version: string }>("/health"),
  authStatus: () => get<AuthStatus>("/auth/status"),
  login: async (username: string, password: string) => {
    const result = await post<{ token: string }>("/auth/login", { username, password });
    setAccessToken(result.token);
    return result;
  },
  initPassword: async (password: string) => {
    const result = await post<{ token: string }>("/auth/init", { password });
    setAccessToken(result.token);
    return result;
  },
  logout: async () => {
    try {
      await post<{ ok: boolean }>("/auth/logout");
    } finally {
      clearAccessToken();
    }
  },
  tasks: async () => {
    const result = await get<{ tasks?: Task[]; active?: string }>("/tasks");
    return { tasks: result.tasks ?? [], active: result.active ?? "" };
  },
  task: (id: string) => get<Task>(`/tasks/${encodeURIComponent(id)}`),
  stats: (task?: string) => get<DashboardStats>(`/stats${task ? `?task=${encodeURIComponent(task)}` : ""}`),
  settings: () => get<ArtexSystemSettings>("/settings"),
  setSettings: (patch: Partial<ArtexSystemSettings>) => put<ArtexSystemSettings>("/settings", patch),
  activity: (task?: string, options?: { intent?: string; since?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (task) params.set("task", task);
    if (options?.intent) params.set("intent", options.intent);
    if (options?.since) params.set("since", String(options.since));
    if (options?.limit) params.set("limit", String(options.limit));
    return get<{ items?: Activity[]; cursor?: number }>(`/exploration/activity?${params.toString()}`).then(
      (result) => ({
        items: result.items ?? [],
        cursor: result.cursor ?? 0,
      }),
    );
  },
  tokenStats: (task?: string) => {
    const query = task ? `?task=${encodeURIComponent(task)}` : "";
    return get<{ workers?: TokenUsage[]; sessions?: SessionTokenUsage[]; total?: TokenTotal }>(
      `/exploration/tokens${query}`,
    ).then((result) => ({
      workers: result.workers ?? [],
      sessions: result.sessions ?? [],
      total: result.total ?? {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      },
    }));
  },
  conversationTokens: () =>
    get<ConversationTokenSummary[]>("/tokens/conversations").catch(() => [] as ConversationTokenSummary[]),
  usageStats: (days = 365) => get<UsageStats>(`/tokens/usage?days=${days}`),
  activityHistory: (id: string, session = "main", limit = 200) =>
    get<ActivityHistory>(
      `/exploration/activity/history?task=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}&limit=${limit}`,
    ),
  mainSessions: (id: string) =>
    get<{ sessions?: MainSession[]; current?: number }>(
      `/exploration/main-sessions?task=${encodeURIComponent(id)}`,
    ).then((result) => ({ sessions: result.sessions ?? [], current: result.current ?? 0 })),
  intents: (id: string, limit = 200) =>
    get<{ items?: TaskNode[]; has_more?: boolean }>(
      `/exploration/intents?task=${encodeURIComponent(id)}&limit=${limit}&before=0&page=1`,
    ).then((result) => result.items ?? []),
  explorationGraph: (id: string) =>
    get<{ nodes?: TaskNode[]; edges?: Array<{ src: string; dst: string }> }>(
      `/exploration/graph?task=${encodeURIComponent(id)}`,
    ).then((result) => ({ nodes: result.nodes ?? [], edges: result.edges ?? [] })),
  taskFindings: (id: string) =>
    get<Finding[]>(`/exploration/findings?task=${encodeURIComponent(id)}`).then((result) => result ?? []),
  taskAssets: (id: string, limit = 100) =>
    get<{ assets?: Asset[]; total?: number; count?: number }>(
      `/assets?task_id=${encodeURIComponent(id)}&limit=${limit}&offset=0`,
    ).then((result) => ({ assets: result.assets ?? [], total: result.total ?? result.count ?? 0 })),
  taskCoverage: (id: string) => get<TaskCoverage>(`/tasks/${encodeURIComponent(id)}/coverage`),
  taskLLMResolution: (id: string) =>
    get<Record<"mainagent" | "planner" | "worker", TaskLLMResolution>>(
      `/tasks/${encodeURIComponent(id)}/llm/resolution`,
    ),
  taskCoverageGraph: (id: string) => get<CoverageGraph>(`/tasks/${encodeURIComponent(id)}/coverage-graph`),
  taskReport: (id: string) =>
    request<string>(`/report?task=${encodeURIComponent(id)}`, undefined, false, "text"),
  controlTask: (id: string, action: "pause" | "resume") =>
    post<{ id: string; paused: boolean; queued: boolean; status: string }>(
      `/tasks/${encodeURIComponent(id)}/control`,
      { action },
    ),
  archiveTask: (id: string) =>
    post<{ id?: number; status?: string }>(`/tasks/${encodeURIComponent(id)}/archive`),
  findingRetests: (findingId: string) =>
    get<{ retests?: FindingRetest[] }>(`/exploration/findings/${encodeURIComponent(findingId)}/retests`).then(
      (result) => result.retests ?? [],
    ),
  startFindingRetest: (findingId: string, notes = "") =>
    post<{ retest: FindingRetest; created: boolean }>(
      `/exploration/findings/${encodeURIComponent(findingId)}/retests`,
      { notes },
    ),
  createTask: (input: { name: string; description: string; goal: string }) =>
    post<Task>("/tasks", {
      name: input.name,
      description: input.description,
      goal: input.goal,
      llm_profile_ids: [],
      source_task_ids: [],
      company_ids: [],
      timeout_seconds: 0,
      seed_first_intent: false,
      plan_heartbeat_seconds: 0,
      coverage_enabled: true,
    }),
  chat: (taskId: string, message: string) =>
    post<ChatResponse>(`/chat?task=${encodeURIComponent(taskId)}`, { message }),
  stopChat: (taskId: string) => post<{ ok: boolean }>(`/tasks/${encodeURIComponent(taskId)}/chat/stop`),
  /**
   * 对话（= 「模式」会话）。接口口径沿用迁移前 ARTEX Web 的 API 封装。
   *
   * 语义：`agent_key` 是模式（auto / pentest / 自定义）；发一条消息会在服务端后端起跑
   * 该 agent，步骤落 `conversation_activities`，客户端按 `?since=<游标>` 增量轮询
   * （没有 SSE 通道，SSE 只服务任务活动流）。
   */
  conversations: () =>
    get<{ conversations?: ArtexConversation[] }>("/conversations").then(
      (result) => result.conversations ?? [],
    ),
  createConversation: (agentKey: string, title = "") =>
    post<ArtexConversation>("/conversations", {
      agent_key: agentKey,
      title,
      llm_profile_id: null,
    }),
  /** 会话级模型 pin（PATCH /conversations/{id}/profile）；null = 清除 */
  setConversationProfile: (id: number, llmProfileId: number | null) =>
    patch<{ ok: boolean }>(`/conversations/${id}/profile`, { llm_profile_id: llmProfileId }),
  deleteConversation: (id: number) => del<{ deleted?: number }>(`/conversations/${id}`),
  conversationMessages: (id: number, since = 0) =>
    get<{ items?: Activity[]; cursor?: number; running?: boolean }>(
      `/conversations/${id}/messages?since=${since}`,
    ).then((result) => ({
      items: result.items ?? [],
      cursor: result.cursor ?? since,
      running: Boolean(result.running),
    })),
  sendConversationMessage: (id: number, message: string, attachments: ChatAttachment[] = []) =>
    post<{ status?: string }>(`/conversations/${id}/messages`, { message, attachments }),
  /**
   * 上传对话附件（图片等）。`id` 用**会话的聊天目录 id**（`conv-<conversationId>`），
   * 与 server/chatupload.go 的落盘目录（sessions/<id>/uploads）一致。
   * 服务端会回 `{attachments:[{name,path,size,abs}]}`，原样带进 sendConversationMessage。
   */
  uploadChatAttachments: (scope: "task" | "session" | "staging", id: string, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append("file", file);
    return request<{ attachments?: ChatAttachment[] }>(
      `/chat/upload?scope=${scope}&id=${encodeURIComponent(id)}`,
      { method: "POST", body },
    ).then((result) => result.attachments ?? []);
  },
  stopConversation: (id: number) => post<{ status?: string }>(`/conversations/${id}/stop`, {}),
  /**
   * 任务归档（冷归档：任务被压成归档包并从活动列表移走）。
   * 路由见 server/server.go:734-741；列表返回 TaskArchivePage（items/total/page/size）。
   */
  taskArchives: (query = "", state = "", page = 0, size = 100) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (state.trim()) params.set("state", state.trim());
    params.set("page", String(page));
    params.set("size", String(size));
    return get<{ items?: ArtexTaskArchive[]; total?: number }>(`/task-archives?${params.toString()}`).then(
      (result) => ({ items: result.items ?? [], total: result.total ?? 0 }),
    );
  },
  restoreTaskArchive: (id: number) => post<ArtexTaskArchive>(`/task-archives/${id}/restore`, {}),
  deleteTaskArchive: (id: number) => del<{ deleted?: number }>(`/task-archives/${id}`),
  steerStatus: (taskId: string) => get<TaskSteerStatus>(`/tasks/${encodeURIComponent(taskId)}/steer`),
  steer: (taskId: string, message: string, intentId?: number) =>
    post<TaskSteerResult>(`/tasks/${encodeURIComponent(taskId)}/steer`, {
      message,
      ...(intentId ? { intent_id: intentId } : {}),
    }),
  assets: (type = "", limit = 50, offset = 0) =>
    get<{ assets?: Asset[]; total?: number; count?: number }>(
      `/assets?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`,
    ).then((result) => ({
      assets: result.assets ?? [],
      total: result.total ?? result.count ?? 0,
    })),
  assetCounts: () => get<Record<string, number>>("/assets/counts"),
  findings: (page = 1, limit = 20, query = "") => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: "severity",
    });
    if (query.trim()) params.set("q", query.trim());
    return get<FindingPage>(`/exploration/findings?${params.toString()}`);
  },
  allFindings: (task?: string) =>
    get<Finding[]>(`/exploration/findings${task ? `?task=${encodeURIComponent(task)}` : ""}`).then(
      (result) => result ?? [],
    ),
  findingStats: () => get<FindingStats>("/exploration/findings/stats"),
  findingDetail: (id: string) => get<Finding>(findingDetailPath(id)),
  findingLineage: (id: string) => get<FindingLineage>(findingLineagePath(id)),
  findingTraffic: (id: string) => get<FindingTraffic>(findingTrafficPath(id)),
  findingTrafficDetail: (id: string, bindingId: string) =>
    get<FindingTrafficDetail>(findingTrafficDetailPath(id, bindingId)),
  approvals: () => get<{ pending?: Approval[] }>("/intercept/pending").then((result) => result.pending ?? []),
  interceptPending: () =>
    get<{ pending?: Approval[] }>("/intercept/pending").then((result) => result.pending ?? []),
  interceptGetOne: (id: number) => get<Approval>(`/intercept/pending/${id}`),
  decideApproval: (id: number, decision: "allowed" | "denied") =>
    post<{ ok: boolean }>(`/intercept/pending/${encodeURIComponent(id)}/decide`, { decision }),
  interceptDecide: (id: number, decision: "allowed" | "denied") =>
    post<{ ok: boolean }>(`/intercept/pending/${encodeURIComponent(id)}/decide`, { decision }),
  interceptRules: () =>
    get<{ rules?: InterceptRule[] }>("/intercept/rules").then((result) => result.rules ?? []),
  createInterceptRule: (rule: Omit<InterceptRule, "id" | "created_at" | "updated_at">) =>
    post<InterceptRule>("/intercept/rules", rule),
  updateInterceptRule: (id: number, rule: Omit<InterceptRule, "id" | "created_at" | "updated_at">) =>
    put<InterceptRule>(`/intercept/rules/${id}`, rule),
  deleteInterceptRule: (id: number) => del<{ deleted: number }>(`/intercept/rules/${id}`),
  toggleInterceptRule: (id: number, enabled: boolean) =>
    post<{ ok: boolean; enabled: boolean }>(`/intercept/rules/${id}/toggle`, { enabled }),
  interceptHistory: () =>
    get<{ items?: InterceptApprovalRow[] }>("/intercept/history").then((result) => result.items ?? []),
  interceptHistoryPage: (
    page = 1,
    size = 20,
    filter: { status?: Approval["status"]; decision_source?: "rule" | "model" | "unknown" } = {},
  ) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (filter.status) params.set("status", filter.status);
    if (filter.decision_source) params.set("decision_source", filter.decision_source);
    return get<{ items?: InterceptApprovalRow[]; total?: number }>(
      `/intercept/history?${params.toString()}`,
    ).then((result) => ({ items: result.items ?? [], total: result.total ?? result.items?.length ?? 0 }));
  },
  interceptTask: (taskId: string) =>
    get<{ items?: InterceptApprovalRow[] }>(`/intercept/task/${encodeURIComponent(taskId)}`).then(
      (result) => result.items ?? [],
    ),
  interceptTaskPage: (
    taskId: string,
    page = 1,
    size = 20,
    filter: { status?: Approval["status"]; decision_source?: "rule" | "model" | "unknown" } = {},
  ) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (filter.status) params.set("status", filter.status);
    if (filter.decision_source) params.set("decision_source", filter.decision_source);
    return get<{ items?: InterceptApprovalRow[]; total?: number }>(
      `/intercept/task/${encodeURIComponent(taskId)}?${params.toString()}`,
    ).then((result) => ({ items: result.items ?? [], total: result.total ?? result.items?.length ?? 0 }));
  },
  interceptDetail: (id: number) =>
    get<InterceptApprovalRow & { audit: Record<string, unknown> | null }>(`/intercept/history/${id}`),
  interceptExecution: (id: number, conversationId?: number) => {
    const query = conversationId ? `?conversation=${conversationId}` : "";
    return get<{
      conversation_id: number | null;
      task_id: string | null;
      session: string;
      seq: number;
      items: Activity[];
    }>(`/intercept/history/${id}/execution${query}`);
  },
  interceptGetToolConfig: () => get<{ enabled_tools: string[] }>("/intercept/tool-config"),
  interceptSetToolConfig: (enabledTools: string[]) =>
    put<void>("/intercept/tool-config", { enabled_tools: enabledTools }),
  interceptGetJudgeConfig: () => get<JudgeConfig>("/intercept/judge"),
  interceptSetJudgeConfig: (config: JudgeConfig) => put<{ ok: boolean }>("/intercept/judge", config),
  getAutoAllow: () => get<AutoAllowState>("/guard/auto-allow"),
  setAutoAllow: (enabled: boolean, hours: number) =>
    put<AutoAllowState>("/guard/auto-allow", { enabled, hours }),
  llm: () => get<Record<string, unknown>>("/llm"),
  getLLM: () => get<Record<string, unknown>>("/llm"),
  setLLM: (
    provider: string,
    model: string,
    baseUrl: string,
    apiKey: string,
    ratePerSecond = 0,
    ratePerMinute = 0,
    proxy = "",
    contextWindowK = 0,
  ) =>
    post<{ ok?: boolean }>("/llm", {
      provider,
      model,
      base_url: baseUrl,
      proxy,
      api_key: apiKey,
      rate_per_second: ratePerSecond,
      rate_per_minute: ratePerMinute,
      context_window_k: contextWindowK,
    }),
  testLLM: (
    provider: string,
    model: string,
    baseUrl: string,
    apiKey: string,
    proxy = "",
    thinkingType = "",
    reasoningEffort = "",
    profileId?: number,
    streaming = true,
    sessionHeaderKey = "",
  ) =>
    post<{ ok: boolean; error?: string; latency_ms?: number; model?: string; reply?: string }>("/llm/test", {
      provider,
      model,
      base_url: baseUrl,
      proxy,
      api_key: apiKey,
      thinking_type: thinkingType,
      reasoning_effort: reasoningEffort,
      profile_id: profileId,
      streaming,
      session_header_key: sessionHeaderKey,
    }),
  llmProfiles: () =>
    get<{ profiles?: LLMProfile[] }>("/llm/profiles").then((result) => result.profiles ?? []),
  saveLLMProfile: (profile: {
    id?: number;
    name: string;
    format: string;
    model: string;
    base_url?: string;
    proxy?: string;
    api_key?: string;
    rate_per_second?: number;
    rate_per_minute?: number;
    context_window_k?: number;
    thinking_type?: string;
    reasoning_effort?: string;
    priority?: number;
    pool_exclude?: boolean;
    streaming?: boolean;
    max_tokens?: number;
    max_tokens_field?: string;
    session_header_key?: string;
    retry?: LLMProfile["retry"];
  }) => post<{ id: number }>("/llm/profiles", profile),
  deleteLLMProfile: (id: string | number) => del<{ deleted: number }>(`/llm/profiles/${id}`),
  activateLLMProfile: (id: string | number) =>
    post<{ ok: boolean }>("/llm/profiles/active", { id: Number(id) }),
  llmPool: () => get<LLMPoolStatus>("/llm/pool"),
  resetLLMPool: (id?: string | number) => post<LLMPoolStatus>("/llm/pool/reset", { id: id ? Number(id) : 0 }),
  llmRetryPolicy: () => get<LLMRetryPolicy>("/llm/retry-policy"),
  saveLLMRetryPolicy: (policy: LLMRetryPolicy) => post<LLMRetryPolicy>("/llm/retry-policy", policy),
  fetchLLMModels: (provider: string, baseUrl: string, apiKey: string, proxy = "", profileId?: number) =>
    post<{ ok: boolean; error?: string; models?: string[] }>("/llm/models", {
      provider,
      base_url: baseUrl,
      api_key: apiKey,
      proxy,
      profile_id: profileId,
    }),
  mcpServers: () => get<{ servers?: MCPServer[] }>("/mcp").then((result) => result.servers ?? []),
  saveMcpServer: (server: Partial<MCPServer>) => post<{ id: number }>("/mcp", server),
  deleteMcpServer: (id: number) => del<{ deleted: number }>(`/mcp/${id}`),
  mcpTools: (id: number) =>
    get<{ tools?: MCPTool[] }>(`/mcp/${id}/tools`).then((result) => result.tools ?? []),
  refreshMcpServer: (id: number) =>
    post<{ tools?: MCPTool[] }>(`/mcp/${id}/refresh`, {}).then((result) => result.tools ?? []),
  resourceVisibility: (kind: string, id: number) =>
    get<{ agents?: string[] }>(`/visibility/${encodeURIComponent(kind)}/${id}`).then(
      (result) => result.agents ?? [],
    ),
  toggleVisibility: (agentId: string, kind: string, resourceId: number, visible: boolean) =>
    post<{ ok: boolean }>("/visibility/toggle", {
      agent_id: agentId,
      kind,
      resource_id: resourceId,
      visible,
    }),
  tools: () => get<{ tools?: ToolDefinition[] }>("/tools").then((result) => result.tools ?? []),
  saveTool: (key: string, patch: Pick<ToolDefinition, "description" | "schema" | "agents" | "enabled">) =>
    put<{ ok: boolean }>(`/tools/${encodeURIComponent(key)}`, patch),
  resetTool: (key: string) => post<{ ok: boolean }>(`/tools/${encodeURIComponent(key)}/reset`, {}),
  createCustomTool: (
    tool: Pick<
      ToolDefinition,
      "key" | "description" | "schema" | "agents" | "enabled" | "kind" | "exec" | "deferred"
    >,
  ) => post<{ key: string }>("/tools/custom", tool),
  updateCustomTool: (
    key: string,
    tool: Pick<
      ToolDefinition,
      "description" | "schema" | "agents" | "enabled" | "kind" | "exec" | "deferred"
    >,
  ) => put<{ ok: boolean }>(`/tools/custom/${encodeURIComponent(key)}`, tool),
  deleteCustomTool: (key: string) => del<{ deleted: string }>(`/tools/custom/${encodeURIComponent(key)}`),
  testCustomTool: (body: { kind: string; exec: Record<string, unknown>; params: Record<string, unknown> }) =>
    post<{ output: string; is_error: boolean }>("/tools/custom/test", body),
  skills: () => get<{ skills?: SkillItem[] }>("/skills").then((result) => result.skills ?? []),
  createSkill: (skill: {
    name: string;
    description: string;
    license?: string;
    compatibility?: string;
    mcps?: string[];
    instructions?: string;
  }) => post<{ name: string }>("/skills", skill),
  uploadSkill: (file: File, overwrite = false) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ name: string; files: number }>(`/skills/upload${overwrite ? "?overwrite=true" : ""}`, {
      method: "POST",
      body,
    });
  },
  deleteSkill: (name: string) => del<{ deleted: string }>(`/skills/${encodeURIComponent(name)}`),
  updateSkillMeta: (
    name: string,
    meta: { mcps?: string[]; description?: string; license?: string; compatibility?: string },
  ) => put<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}/meta`, meta),
  createSkillDir: (skill: string, path: string) =>
    post<{ dir: string }>(`/skills/${encodeURIComponent(skill)}/dirs`, { path }),
  skillFiles: (name: string) =>
    get<{ files?: string[] }>(`/skills/${encodeURIComponent(name)}/files`).then(
      (result) => result.files ?? [],
    ),
  readSkillFile: (name: string, file: string) =>
    get<{ content?: string; file: string }>(`/skills/${encodeURIComponent(name)}/files/${file}`).then(
      (result) => result.content ?? "",
    ),
  writeSkillFile: (name: string, file: string, content: string) =>
    put<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}/files/${file}`, { content }),
  deleteSkillPath: (skill: string, path: string) =>
    del<{ deleted: string }>(`/skills/${encodeURIComponent(skill)}/files/${path}`),
  skillUsage: (name: string, limit = 50) =>
    get<{ calls?: SkillCall[] }>(`/skills/${encodeURIComponent(name)}/usage?limit=${limit}`).then(
      (result) => result.calls ?? [],
    ),
  missingSkills: (limit = 20) =>
    get<{ missing?: MissingSkill[] }>(`/skills/missing?limit=${limit}`).then(
      (result) => result.missing ?? [],
    ),
  skillVisibility: (name: string) =>
    get<{ agents?: string[] }>(`/visibility/skill/${encodeURIComponent(name)}`).then(
      (result) => result.agents ?? [],
    ),
  toggleSkillVisibility: (agentId: string, skillName: string, visible: boolean) =>
    post<{ ok: boolean }>("/visibility/skill/toggle", { agent_id: agentId, skill_name: skillName, visible }),
  systemSettings: () => get<ArtexSystemSettings>("/settings"),
  saveSystemSettings: (patch: Partial<ArtexSystemSettings> & Record<string, unknown>) =>
    put<ArtexSystemSettings>("/settings", patch),
  testWebSearch: (patch: Record<string, unknown>) =>
    post<{ ok: boolean; error?: string; count?: number; backend?: string }>(
      "/settings/web-search/test",
      patch,
    ),
  detectPython: () => post<{ python_interpreter: string }>("/settings/python/detect", {}),
  agents: () => get<{ agents?: ArtexAgent[] }>("/agents").then((result) => result.agents ?? []),
  agentDetail: (key: string) => get<ArtexAgentDetail>(`/agents/${encodeURIComponent(key)}`),
  getAgent: (key: string) => get<ArtexAgentDetail>(`/agents/${encodeURIComponent(key)}`),
  workspaceList: (path = "") =>
    get<WorkspaceListing>(`/workspace/list?path=${encodeURIComponent(path)}`).then((result) => ({
      path: result.path ?? path,
      entries: result.entries ?? [],
    })),
  workspaceRead: (path: string) => get<WorkspaceFile>(`/workspace/read?path=${encodeURIComponent(path)}`),
  workspaceWrite: (path: string, content: string) =>
    post<{ ok: boolean; path: string }>("/workspace/write", { path, content }),
  workspaceMkdir: (path: string) => post<{ ok: boolean; path: string }>("/workspace/mkdir", { path }),
  workspaceDelete: (path: string) =>
    del<{ ok: boolean }>(`/workspace/delete?path=${encodeURIComponent(path)}`),
  workspaceUpload: (directory: string, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append("file", file);
    return request<{ uploaded: number }>(`/workspace/upload?path=${encodeURIComponent(directory)}`, {
      method: "POST",
      body,
    });
  },
  workspaceDownload: async (path: string) => {
    const blob = await request<Blob>(
      `/workspace/download?path=${encodeURIComponent(path)}`,
      undefined,
      false,
      "blob",
    );
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = path.split("/").pop() || "download";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  },
  commands: (filters?: { task?: string; q?: string; page?: number; size?: number }) => {
    const params = new URLSearchParams();
    if (filters?.task) params.set("task", filters.task);
    if (filters?.q) params.set("q", filters.q);
    params.set("page", String(filters?.page ?? 0));
    params.set("size", String(filters?.size ?? 50));
    return get<{ commands?: CommandRecord[]; total: number }>(`/commands?${params.toString()}`).then(
      (result) => ({
        commands: result.commands ?? [],
        total: result.total ?? 0,
      }),
    );
  },
  commandStats: (filters?: { task?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.task) params.set("task", filters.task);
    if (filters?.q) params.set("q", filters.q);
    return get<{ stats?: ToolStat[] }>(`/commands/stats?${params.toString()}`).then((result) => ({
      stats: result.stats ?? [],
    }));
  },
  llmRecords: (filters?: {
    model?: string;
    session?: string;
    task?: string;
    page?: number;
    size?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.model) params.set("model", filters.model);
    if (filters?.session) params.set("session", filters.session);
    if (filters?.task) params.set("task", filters.task);
    if (filters?.page !== undefined) params.set("page", String(filters.page));
    params.set("size", String(filters?.size ?? 50));
    return get<{ records?: LLMRecordItem[]; total: number }>(`/llm/records?${params.toString()}`).then(
      (result) => ({
        records: result.records ?? [],
        total: result.total ?? 0,
      }),
    );
  },
  llmRecordDetail: (id: number) => get<LLMRecordDetail>(`/llm/records/${id}`),
  llmTasks: () => get<{ tasks?: LLMTask[] }>("/llm/records/tasks").then((result) => result.tasks ?? []),
  llmRecordsDeleteTask: (task: string) =>
    del<{ deleted: number }>(`/llm/records?task=${encodeURIComponent(task)}`),
  ssStatus: () =>
    get<{
      exists: boolean;
      configured: boolean;
      enabled: boolean;
      reachable: boolean;
      url?: string;
      tools: string[];
    }>("/sync/scopesentry/status"),
  ssDatasource: (body: { url?: string; api_key?: string }) =>
    post<{ id: number; enabled: boolean }>("/sync/scopesentry/datasource", body),
  ssProjects: (page = 1, size = 50, search = "") => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.set("search", search);
    return get<{ projects?: SSProject[]; tag?: Record<string, number> }>(
      `/sync/scopesentry/projects?${params.toString()}`,
    ).then((result) => ({ projects: result.projects ?? [], tag: result.tag ?? {} }));
  },
  ssTasks: (page = 1, size = 50, search = "") => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.set("search", search);
    return get<{ tasks?: SSTask[] }>(`/sync/scopesentry/tasks?${params.toString()}`).then(
      (result) => result.tasks ?? [],
    );
  },
  ssSync: (body: {
    dimension: "project" | "task";
    targets: string[];
    asset_types: string[];
    create_company?: boolean;
    page_size?: number;
  }) =>
    post<{
      synced: Record<string, number>;
      companies: string[] | null;
      warnings: string[] | null;
      errors: string[] | null;
    }>("/sync/scopesentry/sync", body),
  intranetTopology: (taskId?: string) => {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : "";
    return get<Partial<IntranetTopology>>(`/intranet/topology${query}`).then((result) => ({
      nodes: result.nodes ?? [],
      edges: result.edges ?? [],
      segments: result.segments ?? [],
    }));
  },
  shellSessions: (taskId?: string) => {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : "";
    return get<{ items?: ShellSession[] }>(`/sessions${query}`).then((result) => result.items ?? []);
  },
  sessionExec: (id: string, command: string, timeout?: number) =>
    post<SessionExecResult>(`/sessions/${encodeURIComponent(id)}/exec`, {
      command,
      ...(timeout ? { timeout } : {}),
    }),
  sessionList: (id: string, path: string) =>
    post<{ entries?: SessionFsEntry[] }>(`/sessions/${encodeURIComponent(id)}/list`, { path }).then(
      (result) => result.entries ?? [],
    ),
  sessionRead: (id: string, path: string) =>
    post<SessionReadResult>(`/sessions/${encodeURIComponent(id)}/read`, { path }),
  sessionWrite: (id: string, path: string, contentBase64: string) =>
    post<{ ok: boolean; bytes: number }>(`/sessions/${encodeURIComponent(id)}/write`, {
      path,
      content_base64: contentBase64,
    }),
  probeSession: (id: string) =>
    post<{ alive: boolean; ms?: number; error?: string }>(`/sessions/${encodeURIComponent(id)}/probe`),
  handoffSession: (id: string) => post<{ task_id: string }>(`/sessions/${encodeURIComponent(id)}/handoff`),
  deleteSession: (id: string) => del<{ ok: boolean }>(`/sessions/${encodeURIComponent(id)}`),
  tunnels: (taskId?: string) => {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : "";
    return get<{ items?: TunnelInfo[] }>(`/tunnels${query}`).then((result) => result.items ?? []);
  },
  teardownTunnel: (id: string) => post<{ ok: boolean }>(`/tunnels/${encodeURIComponent(id)}/teardown`),
  credentials: (taskId?: string) => {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : "";
    return get<{ items?: Credential[] }>(`/credentials${query}`).then((result) => result.items ?? []);
  },
  recentLogs: (since = 0, limit = 500) => get<ArtexRecentLogs>(`/logs?since=${since}&limit=${limit}`),
  logsHistory: (before = 0, limit = 200) =>
    get<ArtexLogHistory>(`/logs/history?before=${before}&limit=${limit}`),
  traffic: (page = 0, size = 50, host = "", method = "", query = ""): Promise<TrafficPage> =>
    get<Parameters<typeof normalizeTrafficPage>[0]>(trafficPath({ page, size, host, method, query })).then(
      normalizeTrafficPage,
    ),
  trafficExchange: (id: string) => get<TrafficDetail>(trafficExchangePath(id)),
  trafficHosts: () =>
    get<{ hosts?: Array<{ host: string; count: number }> }>("/traffic/hosts").then(
      (result) => result.hosts ?? [],
    ),
};

export async function issueSseTicket(): Promise<string> {
  const body = await post<{ ticket: string }>("/sse-ticket");
  if (!body.ticket) throw new ArtexApiError("SSE ticket missing", 502);
  return body.ticket;
}

export async function openLogsStream(
  onMessage: (line: SystemLogLine) => void,
  onError?: (error?: unknown) => void,
  initialSince = 0,
): Promise<() => void> {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempt = 0;
  let lastSequence = initialSince;
  let closed = false;
  let connecting = false;
  let firstConnection = true;

  const scheduleReconnect = () => {
    if (closed || retryTimer) return;
    const delay = Math.min(10_000, 500 * 2 ** retryAttempt);
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (closed || connecting) return;
    connecting = true;
    try {
      const ticket = await issueSseTicket();
      if (closed) return;
      const url = new URL(`${streamOrigin()}/api/logs/stream`);
      url.searchParams.set("ticket", ticket);
      if (lastSequence > 0) url.searchParams.set("since", String(lastSequence));
      const nextSource = new EventSource(url.toString());
      source = nextSource;
      nextSource.onmessage = (event) => {
        if (closed || source !== nextSource) return;
        try {
          const line = JSON.parse(event.data) as SystemLogLine;
          if (typeof line.seq === "number") lastSequence = Math.max(lastSequence, line.seq);
          retryAttempt = 0;
          onMessage(line);
        } catch (error) {
          onError?.(error);
        }
      };
      nextSource.onerror = () => {
        if (closed || source !== nextSource) return;
        nextSource.close();
        source = null;
        onError?.();
        scheduleReconnect();
      };
    } catch (error) {
      if (firstConnection) throw error;
      onError?.(error);
      scheduleReconnect();
    } finally {
      firstConnection = false;
      connecting = false;
    }
  };

  await connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    source?.close();
    source = null;
  };
}

function streamOrigin(): string {
  const configured = import.meta.env.VITE_API_ORIGIN as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  return streamOriginFor(window.location);
}

export async function openActivityStream(
  taskId: string,
  onMessage: (event: MessageEvent<string>) => void,
  onError?: () => void,
  initialSince?: number,
): Promise<() => void> {
  return connectTicketedEventStream({
    taskId,
    initialSince: initialSince ? String(initialSince) : undefined,
    endpoint: `${streamOrigin()}/api/exploration/activity/stream`,
    issueTicket: issueSseTicket,
    createSource: (url): TicketedEventSource => {
      // The one-time ticket is carried in the query string, so cookies are
      // not needed here. Keeping EventSource credential-free also allows a
      // configured external API origin to use its wildcard CORS response.
      const source = new EventSource(url);
      return {
        set onmessage(handler: ((event: SseMessage) => void) | null) {
          source.onmessage = handler
            ? (event) => handler({ data: event.data, lastEventId: event.lastEventId })
            : null;
        },
        set onerror(handler: (() => void) | null) {
          source.onerror = handler ? () => handler() : null;
        },
        close: () => source.close(),
      };
    },
    onMessage: (event) =>
      onMessage(new MessageEvent("message", { data: event.data, lastEventId: event.lastEventId })),
    onError: () => onError?.(),
  });
}
