import type { ApiConnectionConfig, ResolvedApiConfig } from "./types";

/**
 * 自定义 API 配置的**唯一读写入口**。
 *
 * 形态与 `src/settings/store.ts` 保持一致（模块级外部 store + useSyncExternalStore，
 * 不依赖 React Provider），本地持久化键沿用工程的 `codex.*` 命名：`codex.api`。
 *
 * ⚠️ 所有数值都是**未实测**的工程默认值：官方设置页里没有「自定义 API」这一项，
 *    所以无官方数值可对齐；这里只保证「保守、可覆盖、可解释」。
 */

export const API_CONFIG_STORAGE_KEY = "codex.api";

/** 默认配置：**故意留空 baseUrl / model** —— 没配置时对话会给出明确指引，而不是偷偷打 OpenAI */
export const DEFAULT_API_CONFIG: ResolvedApiConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  headers: {},
  /** 未实测：连接 + 首包 30s，够覆盖冷启动的本地大模型 */
  timeoutMs: 30_000,
  /** 未实测：流式空闲 60s。长思考模型可能更久，用户可在设置里调大 */
  idleTimeoutMs: 60_000,
  stream: true,
  temperature: null,
  maxTokens: null,
  systemPrompt: "",
  /**
   * 「关于你（背景与偏好）」—— 与 systemPrompt 一起拼成同一条 system 消息（见 client.ts）。
   * 出处：官方「个性化」页的自定义指令/关于你（settings.chatGpt.personalization.*）；
   * 本工程把它并进自定义 API（用户 2026-10-15 指定），因为它最终就是提示词的一部分。
   */
  userProfile: "",
  /**
   * 推理强度 → 请求体 `reasoning_effort`（OpenAI 兼容的推理模型参数）。
   * 出处：官方「配置」页 settings.agent.speed.label / 模型芯片的强度档；
   * 空串 = 完全不发送该字段（不兼容的网关不会因此 400）。
   */
  reasoningEffort: "",
  includeUsage: false,
};

const TIMEOUT_MIN = 1_000;
const TIMEOUT_MAX = 600_000;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function numberOrNull(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function sanitizeHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const name = key.trim();
    if (!name || value === null || value === undefined) continue;
    out[name] = String(value);
  }
  return out;
}

/** 任意来源（localStorage / 设置表单 / 代码）→ 规范化配置：绝不抛异常 */
export function normalizeApiConfig(input: Partial<ResolvedApiConfig> | null | undefined): ResolvedApiConfig {
  const raw = input ?? {};
  return {
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : DEFAULT_API_CONFIG.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : DEFAULT_API_CONFIG.apiKey,
    model: typeof raw.model === "string" ? raw.model.trim() : DEFAULT_API_CONFIG.model,
    headers: sanitizeHeaders(raw.headers),
    timeoutMs: clampNumber(raw.timeoutMs, TIMEOUT_MIN, TIMEOUT_MAX, DEFAULT_API_CONFIG.timeoutMs),
    idleTimeoutMs: clampNumber(raw.idleTimeoutMs, TIMEOUT_MIN, TIMEOUT_MAX, DEFAULT_API_CONFIG.idleTimeoutMs),
    stream: raw.stream === undefined ? DEFAULT_API_CONFIG.stream : Boolean(raw.stream),
    temperature: numberOrNull(raw.temperature, 0, 2),
    maxTokens: numberOrNull(raw.maxTokens, 1, 1_000_000),
    systemPrompt: typeof raw.systemPrompt === "string" ? raw.systemPrompt : DEFAULT_API_CONFIG.systemPrompt,
    userProfile: typeof raw.userProfile === "string" ? raw.userProfile : DEFAULT_API_CONFIG.userProfile,
    reasoningEffort:
      typeof raw.reasoningEffort === "string" && REASONING_EFFORTS.includes(raw.reasoningEffort)
        ? raw.reasoningEffort
        : DEFAULT_API_CONFIG.reasoningEffort,
    includeUsage: Boolean(raw.includeUsage),
  };
}

/**
 * 推理强度可选值（reasoning_effort 的官方取值 + 空档）。
 * 空串放第一位 = 默认，表示"不发送该字段"，对不认识的网关最安全。
 */
export const REASONING_EFFORTS = ["", "minimal", "low", "medium", "high"];

/** 能不能开聊：地址与模型名两者缺一不可（apiKey 允许为空 —— 本地服务常常不校验） */
export function isApiConfigured(config: ResolvedApiConfig = getApiConfig()): boolean {
  return Boolean(config.baseUrl.trim() && config.model.trim());
}

export interface ApiConfigIssue {
  field: keyof ResolvedApiConfig;
  level: "error" | "warn";
  message: string;
}

/** 设置页的表单校验（前端先拦一道，真正的错误还是靠请求返回） */
export function validateApiConfig(config: ResolvedApiConfig): ApiConfigIssue[] {
  const issues: ApiConfigIssue[] = [];
  const baseUrl = config.baseUrl.trim();

  if (!baseUrl) {
    issues.push({
      field: "baseUrl",
      level: "error",
      message: "必填：例如 https://api.deepseek.com 或 http://127.0.0.1:8000/v1",
    });
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    issues.push({ field: "baseUrl", level: "error", message: "必须以 http:// 或 https:// 开头" });
  } else if (baseUrl.includes("?")) {
    issues.push({
      field: "baseUrl",
      level: "warn",
      message: "带 query 的地址不会自动处理，建议直接填完整的 /chat/completions 端点",
    });
  }

  if (!config.model.trim()) {
    issues.push({
      field: "model",
      level: "error",
      message: "必填：例如 deepseek-chat / gpt-4o-mini / qwen2.5:7b",
    });
  }
  if (!config.apiKey.trim()) {
    issues.push({
      field: "apiKey",
      level: "warn",
      message: "留空则不发送 Authorization 头；云端服务通常需要填",
    });
  }
  return issues;
}

/** 设置页表单的字段清单（顺序即渲染顺序）。cx-settings 可以直接遍历它生成表单，不用猜字段名 */
export interface ApiConfigField {
  key: keyof ResolvedApiConfig;
  label: string;
  kind: "text" | "password" | "number" | "switch" | "textarea" | "headers" | "select";
  placeholder?: string;
  help: string;
  /** kind === "select" 时的选项（value 原样写进配置） */
  options?: Array<{ value: string; label: string }>;
  /** 暴露给「高级」折叠区 */
  advanced?: boolean;
}

export const API_CONFIG_FIELDS: ApiConfigField[] = [
  {
    key: "baseUrl",
    label: "Base URL",
    kind: "text",
    placeholder: "https://api.deepseek.com 或 http://127.0.0.1:8000/v1",
    help: "OpenAI 兼容端点。不带 /v1 时会自动补 /v1/chat/completions；也可以直接填完整的 /chat/completions 地址。",
  },
  {
    key: "apiKey",
    label: "API Key",
    kind: "password",
    placeholder: "sk-…（本地服务可留空）",
    help: "只保存在本机 localStorage，不会上传到任何地方。",
  },
  {
    key: "model",
    label: "模型",
    kind: "text",
    placeholder: "deepseek-chat",
    help: "请求体里的 model 字段。填错时服务端通常返回 400/404。",
  },
  {
    key: "systemPrompt",
    label: "系统提示词",
    kind: "textarea",
    placeholder: "可选",
    help: "每次请求前自动加一条 system 消息。",
    advanced: true,
  },
  {
    key: "userProfile",
    label: "关于你（背景与偏好）",
    kind: "textarea",
    placeholder: "例如：我是安全工程师，回答请先给结论、术语保留英文原词",
    help: "官方「个性化」页的自定义指令；这里与系统提示词拼成同一条 system 消息（提示词在前）。",
    advanced: true,
  },
  {
    key: "reasoningEffort",
    label: "推理强度",
    kind: "select",
    help: "官方「配置」页的速度/强度档；发送为请求体 reasoning_effort，留空则完全不发送该字段。",
    options: [
      { value: "", label: "不设置（用服务端默认）" },
      { value: "minimal", label: "极低（minimal）" },
      { value: "low", label: "低（low）" },
      { value: "medium", label: "中（medium）" },
      { value: "high", label: "高（high）" },
    ],
    advanced: true,
  },
  {
    key: "temperature",
    label: "temperature",
    kind: "number",
    placeholder: "留空 = 用服务端默认",
    help: "0~2，留空则完全不发送该字段。",
    advanced: true,
  },
  {
    key: "maxTokens",
    label: "max_tokens",
    kind: "number",
    placeholder: "留空 = 用服务端默认",
    help: "留空则完全不发送该字段。",
    advanced: true,
  },
  {
    key: "stream",
    label: "流式输出（SSE）",
    kind: "switch",
    help: "关闭后走一次性 JSON。服务端不支持流式时会自动降级，不用手动关。",
    advanced: true,
  },
  {
    key: "timeoutMs",
    label: "连接超时（毫秒）",
    kind: "number",
    placeholder: String(DEFAULT_API_CONFIG.timeoutMs),
    help: "连接 + 首包超时，1000~600000。",
    advanced: true,
  },
  {
    key: "idleTimeoutMs",
    label: "流式空闲超时（毫秒）",
    kind: "number",
    placeholder: String(DEFAULT_API_CONFIG.idleTimeoutMs),
    help: "流式中两块之间的最大间隔，超了就中断。",
    advanced: true,
  },
  {
    key: "includeUsage",
    label: "请求流式 usage",
    kind: "switch",
    help: "发送 stream_options.include_usage；部分不兼容的网关会因此报 400。",
    advanced: true,
  },
  {
    key: "headers",
    label: "自定义请求头",
    kind: "headers",
    help: "例如 api-key、x-api-key、HTTP-Referer。同名时覆盖内置头。",
    advanced: true,
  },
];

const listeners = new Set<() => void>();
let cache: ResolvedApiConfig | null = null;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // 隐私模式 / 被策略禁用
  }
}

export function loadApiConfig(): ResolvedApiConfig {
  const store = storage();
  if (!store) return { ...DEFAULT_API_CONFIG };
  try {
    const raw = store.getItem(API_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_API_CONFIG };
    return normalizeApiConfig(JSON.parse(raw) as Partial<ResolvedApiConfig>);
  } catch {
    // 存的 JSON 坏了：当作没配过，不让整个应用挂掉
    return { ...DEFAULT_API_CONFIG };
  }
}

function persist(config: ResolvedApiConfig) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 配额满 / 被禁用：内存里照样生效，只是下次打开要重填
  }
}

/** 当前配置（快照引用稳定，可直接喂 useSyncExternalStore） */
export function getApiConfig(): ResolvedApiConfig {
  if (!cache) cache = loadApiConfig();
  return cache;
}

export function subscribeApiConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: ResolvedApiConfig): ResolvedApiConfig {
  cache = next;
  persist(next);
  for (const listener of listeners) listener();
  return next;
}

/** 全量保存（设置页「保存」按钮用） */
export function saveApiConfig(config: ApiConnectionConfig | ResolvedApiConfig): ResolvedApiConfig {
  return commit(normalizeApiConfig(config));
}

/** 局部更新（切换开关、只改一个字段时用）。注意 `headers` 是整体替换 */
export function updateApiConfig(patch: Partial<ApiConnectionConfig>): ResolvedApiConfig {
  return commit(normalizeApiConfig({ ...getApiConfig(), ...patch }));
}

export function resetApiConfig(): ResolvedApiConfig {
  return commit({ ...DEFAULT_API_CONFIG });
}

/** 供测试/多标签页同步：外部改了 localStorage 后重新读一次 */
export function reloadApiConfig(): ResolvedApiConfig {
  return commit(loadApiConfig());
}
