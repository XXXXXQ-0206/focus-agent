/**
 * 任务归档条目（`GET /api/task-archives` 的 items[]）——
 * 出处：db/task_archives.go:53-80 TaskArchive 的 JSON 视图（`ArchivePath` 是 `json:"-"`，不下发）。
 */
export interface ArtexTaskArchive {
  id: number;
  task_id: number;
  state: string;
  phase: string;
  progress: number;
  error?: string;
  format_version: number;
  sha256?: string;
  original_size: number;
  compressed_size: number;
  task_name: string;
  task_description: string;
  task_goal: string;
  original_status: string;
  category_name?: string;
  source_task_ids: number[];
  archived_at?: string;
  requested_at: string;
  created_at: string;
  updated_at: string;
}

export interface AuthStatus {
  initialized: boolean;
}

export interface Task {
  id: string;
  name?: string;
  category_id?: number;
  category_name?: string;
  pinned?: boolean;
  description?: string;
  goal?: string;
  status?: string;
  created_at?: number | string;
  completed_at?: number | string;
  last_activity_unix?: number;
  last_activity?: string;
  paused?: boolean;
  queued?: boolean;
  engine_mode?: string;
  tokens?: number | Record<string, unknown>;
  goals_total?: number;
  goals_met?: number;
  in_flight?: number | boolean;
  source_task_ids?: string[];
  coverage_enabled?: boolean;
}

export interface Activity {
  id?: number | string;
  seq?: number | string;
  task_id?: string;
  intent_id?: number | string;
  kind?: string;
  type?: string;
  worker?: string;
  tool?: string;
  tool_use_id?: string;
  message?: string;
  content?: string;
  text?: string;
  summary?: string;
  detail?: string;
  ts?: string;
  is_error?: boolean;
  main_seg?: number;
  source_task_id?: string;
  created_at?: number | string;
  [key: string]: unknown;
}

/**
 * Focus 对话（`/api/conversations`）—— 「模式」的载体。
 *
 * 出处：server/conversations.go + 迁移前的 ARTEX Web 类型定义。
 * `agent_key` 就是用户说的「模式」：`auto`（Auto / 操作助手）、`pentest`（渗透测试）、
 * 以及自定义 agent（报告撰写 / 漏洞复测 / 漏洞验证…）。`running` 是列表接口附带的实时态。
 */
/** 对话附件（对应 server/chatupload.go 的 chatAttachment） */
export interface ChatAttachment {
  name: string;
  /** 相对会话工作目录的路径，如 uploads/report.png */
  path: string;
  size: number;
  /** 落盘绝对路径（上传响应里就有） */
  abs?: string;
}

export interface ArtexConversation {
  id: number;
  agent_key: string;
  title: string;
  running?: boolean;
  llm_profile_id?: number | null;
  pinned?: boolean;
  pinned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityHistory {
  items: Activity[];
  snapshot_cursor: number;
  earliest_cursor: number;
  has_more: boolean;
}

export interface MainSession {
  seq: number;
  created_at: string;
}

export interface TaskNode {
  id: string;
  type: string;
  payload?: string;
  priority: number;
  state: string;
  origin: string;
  ts: string;
  source_task_id?: string;
  inherited?: boolean;
}

export interface TaskCoverage {
  enabled: boolean;
  scope_rows: number;
  denominator: number;
  tested: number;
  pct: number | null;
  by_type: Array<{ type: string; total: number; tested: number }>;
}

export interface CoverageGraphNode {
  key: string;
  kind: string;
  label: string;
  tested: boolean;
  in_scope: boolean;
  asset_id?: number;
}

export interface CoverageGraph {
  nodes: CoverageGraphNode[];
  edges: Array<{ src: string; dst: string }>;
}

export interface TaskSteerStatus {
  running: Array<{ intent_id: number; pending: number }>;
  steerable: boolean;
}

export interface TaskSteerResult {
  ok: boolean;
  delivered: Array<{ intent_id: number; pending: number }>;
  skipped?: string[];
}

export interface ChatAccepted {
  status: "accepted";
  mode: "llm" | string;
}

export interface ChatReply {
  reply: string;
  mode: "rule" | string;
}

export type ChatResponse = ChatAccepted | ChatReply;

export type AssetType = "root_domain" | "ip" | "subdomain" | "app" | "service" | "endpoint";

export interface Asset {
  id: number;
  type: AssetType;
  domain?: string;
  root_domain?: string;
  ip?: string;
  url?: string;
  port?: number;
  service_name?: string;
  service_type?: string;
  page_title?: string;
  status_code?: number;
  technologies?: string[];
  last_seen?: string;
  honeypot_score?: number;
}

export interface Finding {
  id: string;
  finding_id?: string;
  vulnclass: string;
  name?: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  summary: string;
  evidence?: string;
  report?: string;
  traffic_count?: number;
  evidence_version?: number;
  report_stale?: boolean;
  intent_id?: string;
  param_id?: string;
  source_task_id?: string;
  inherited?: boolean;
  assets?: Array<{ id: string; type: string; label: string }>;
  task_id?: string;
  task_description?: string;
  ts?: string;
}

export interface FindingLineage {
  nodes: Array<Record<string, unknown>>;
  edges: Array<{ src: string; dst: string; rel: string }>;
}

export interface FindingTrafficSnapshot {
  id: string;
  source_traffic_id: string;
  captured_at: number;
  url: string;
  method: string;
  status: number;
  content_type: string;
  req_len: number;
  resp_len: number;
}

export interface FindingTrafficBinding {
  id: string;
  role: string;
  note: string;
  position: number;
  snapshot: FindingTrafficSnapshot;
}

export interface FindingTraffic {
  finding_id: string;
  version: number;
  report_version: number;
  bindings: FindingTrafficBinding[];
}

export interface EvidenceBodyPreview {
  content: string;
  offset: number;
  total: number;
  next_offset: number;
  truncated: boolean;
  binary: boolean;
}

export interface FindingTrafficDetail {
  binding: FindingTrafficBinding;
  request: EvidenceBodyPreview;
  response: EvidenceBodyPreview;
}

export interface FindingRetest {
  id: number;
  finding_id?: number | string;
  conversation_id?: number | null;
  status: "pending" | "running" | "completed" | "failed" | "stopped" | string;
  verdict?: "reproduced" | "fixed" | "inconclusive" | "" | string;
  notes?: string;
  summary?: string;
  evidence?: string;
  error?: string;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface TrafficExchange {
  id: string;
  ts?: string;
  host?: string;
  method?: string;
  url?: string;
  status?: number;
  content_type?: string;
  resp_len?: number;
}

export interface TrafficDetail {
  req: string;
  resp: string;
}

export interface FindingPage {
  items: Finding[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface FindingStats {
  total: number;
  pending: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Approval {
  id: number;
  agent_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  status: "pending" | "allowed" | "denied" | "timeout";
  reason: string;
  task_id?: string;
  conversation_id?: number;
  created_at?: string;
  decision_source?: "rule" | "model" | "unknown" | "";
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  mtime: number;
}

export interface WorkspaceListing {
  path: string;
  entries: WorkspaceEntry[];
}

export interface WorkspaceFile {
  path: string;
  size: number;
  binary: boolean;
  too_large?: boolean;
  content?: string;
}

export interface CommandRecord {
  id: number;
  exploration_id: number;
  worker: string;
  tool: string;
  command: string;
  output: string;
  is_error: boolean;
  created_at: string;
}

export interface ToolStat {
  tool: string;
  total: number;
  errors: number;
}

export interface LLMRecordItem {
  id: number;
  ts: string;
  model: string;
  profile_name: string;
  session_id: string;
  task_id: string;
  worker: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  status: string;
  error?: string;
}

export interface LLMRecordDetail extends LLMRecordItem {
  request_body: string;
  response_body: string;
  raw_request?: string;
  raw_response?: string;
}

export interface LLMTask {
  task_id: string;
  count: number;
}

export interface LLMProfile {
  [key: string]: unknown;
  id: string;
  name: string;
  format: "openai" | "anthropic" | "openai-responses" | string;
  model: string;
  base_url?: string;
  proxy?: string;
  api_key_hint?: string;
  rate_per_second?: number;
  rate_per_minute?: number;
  context_window_k?: number;
  thinking_type?: string;
  reasoning_effort?: string;
  is_default?: boolean;
  priority?: number;
  pool_exclude?: boolean;
  streaming?: boolean;
  max_tokens?: number;
  max_tokens_field?: string;
  session_header_key?: string;
  retry?: LLMRetryOverride;
}

export interface LLMRetryRule {
  attempts: number;
  interval_ms: number;
}

export interface LLMRetryOverride {
  connect: LLMRetryRule;
  empty: LLMRetryRule;
  stream: LLMRetryRule;
}

export interface LLMRetryPolicy extends LLMRetryOverride {
  breaker: LLMRetryRule;
  intent: LLMRetryRule;
}

export interface LLMPoolMember {
  profile_id: string;
  name: string;
  model: string;
  format: string;
  priority: number;
  active: boolean;
  excluded: boolean;
  state: "ok" | "degraded" | "tripped";
  fails: number;
  trips: number;
  cooldown_secs: number;
  last_error?: string;
  last_at?: string;
}

export interface LLMPoolStatus {
  enabled: boolean;
  bind_fallback: boolean;
  chain: LLMPoolMember[];
}

export interface MCPServer {
  [key: string]: unknown;
  id: number;
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  enabled: boolean;
  insecure?: boolean;
  tools?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
}

export interface ToolDefinition {
  [key: string]: unknown;
  key: string;
  system: boolean;
  description: string;
  schema: Record<string, unknown>;
  agents: string[];
  enabled: boolean;
  kind?: "builtin" | "shell" | "command" | "script" | "http";
  exec?: Record<string, unknown>;
  deferred?: boolean;
  calls?: number;
}

export interface SkillItem {
  [key: string]: unknown;
  name: string;
  description?: string;
  license?: string;
  compatibility?: string;
  mcps?: string[];
  files: string[];
  calls: number;
  tasks: number;
  usage_agents: string[];
  last_used?: string;
}

export interface SkillCall {
  ts: string;
  agent_key: string;
  task_id: number;
  session_id: string;
  args_len: number;
}

export interface MissingSkill {
  skill: string;
  calls: number;
  agents: string[];
  last_used?: string;
}

export interface InterceptRule {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  match_target: "tool_name" | "tool_input";
  match_type: "string" | "regex";
  pattern: string;
  action: "allow" | "deny" | "ask";
  message: string;
  timeout_enabled: boolean;
  timeout_seconds: number;
  timeout_action: "deny" | "allow";
  created_at: string;
  updated_at: string;
}

export interface InterceptApprovalRow extends Approval {
  conv_title: string;
  conv_agent_key: string;
  rule_name: string;
}

export interface JudgeConfig {
  enabled: boolean;
  profile_id: number;
  prompt: string;
  timeout_seconds: number;
  fail_action: "allow" | "ask" | "deny";
  ask_timeout_seconds: number;
  ask_timeout_action: "allow" | "deny";
}

export interface AutoAllowState {
  enabled: boolean;
  expires_at: number;
  remaining_seconds: number;
}

export interface SSProject {
  id: string;
  name: string;
  logo?: string;
  AssetCount?: number;
  tag?: string;
}

export interface SSTask {
  id: string;
  name: string;
  status?: number;
  progress?: number;
  creatTime?: string;
  endTime?: string;
}

export interface IntranetNode {
  id: string;
  ip: string;
  segment: string;
  has_session: boolean;
  alive_sessions: number;
  is_callback: boolean;
}

export interface IntranetEdge {
  id: string;
  kind: string;
  from: string;
  to: string;
  state: string;
}

export interface IntranetTopology {
  nodes: IntranetNode[];
  edges: IntranetEdge[];
  segments: Array<{ name: string; color_key: string }>;
}

export interface ShellSession {
  id: string;
  kind: string;
  url: string;
  lang: string;
  platform: string;
  host_asset_id: string;
  status: string;
  last_beat: string;
  created_by_task?: number;
}

export interface SessionExecResult {
  stdout: string;
  stderr: string;
  ms: number;
  timed_out: boolean;
  error?: string;
}

export interface SessionFsEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

export interface SessionReadResult {
  content?: string;
  content_base64?: string;
  truncated: boolean;
}

export interface TunnelInfo {
  id: string;
  task_id: number;
  kind: string;
  state: string;
  listen_host: string;
  listen_port: number;
  target_host?: string;
  target_port?: number;
  via_session_id: string;
  last_check: string;
  error?: string;
}

export interface Credential {
  id: string;
  cred_type: string;
  username: string;
  domain: string;
  secret_masked: string;
  source: string;
  verified: boolean;
  created_at: string;
  task_id?: number;
}

export interface DashboardStats {
  assets: number;
  engine_mode: string;
  llm_configured: boolean;
  roe_enabled: boolean;
  findings_confirmed: number;
  active_task?: Partial<Task>;
}

export interface TokenUsage {
  worker: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface SessionTokenUsage {
  session: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface TokenTotal {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface ConversationTokenSummary {
  llm_profile_id: number | null;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface UsageStats {
  by_profile: Array<{
    profile_name: string;
    calls: number;
    tasks: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
  }>;
  daily: Array<{
    profile_name: string;
    date: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
  }>;
}
