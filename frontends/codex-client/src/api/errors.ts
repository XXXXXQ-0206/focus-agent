import type { ApiErrorKind } from "./types";

/**
 * 统一错误类型 + 中文文案。
 *
 * 分类的意义不只是好看：UI 要靠它决定「要不要给重试按钮」，
 * 而「用户点了停止」必须和「网络真的断了」分开 —— 前者不弹红字，
 * 后者要提示。`kind === "aborted"` 就是那条分界线。
 */

export interface ApiErrorInit {
  kind: ApiErrorKind;
  /** 面向用户的中文文案（已经可以直接显示） */
  message: string;
  status?: number;
  /** 服务端返回体原文（已截断），展开「详情」时显示 */
  detail?: string;
  /** 429 的 Retry-After 换算结果 */
  retryAfterMs?: number;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly detail: string;
  readonly retryAfterMs: number | null;
  /** 原始异常（不参与序列化） */
  readonly cause: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.detail = init.detail ?? "";
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.cause = init.cause;
  }

  /** 值不值得给「重试」按钮 */
  get retryable(): boolean {
    return (
      this.kind !== "aborted" && this.kind !== "config" && this.kind !== "auth" && this.kind !== "forbidden"
    );
  }

  /** 给 react-query / 日志用的可序列化形态 */
  toJSON() {
    return { kind: this.kind, message: this.message, status: this.status, detail: this.detail };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** HTTP 状态码 → 分类 */
export function classifyStatus(status: number): ApiErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "unknown";
}

/** 分类 + 状态码 → 中文文案。`detail` 是服务端原话，有就缀在后面 */
export function messageForStatus(kind: ApiErrorKind, status: number, detail = ""): string {
  const tail = detail ? ` 服务端信息：${detail}` : "";
  switch (kind) {
    case "auth":
      return `认证失败（401）：API Key 无效或缺失。请在设置里检查自定义 API 的密钥。${tail}`;
    case "forbidden":
      return `无权访问（403）：密钥被拒绝，或该密钥没有这个模型/端点的权限。${tail}`;
    case "not_found":
      return `接口不存在（404）：请检查 Base URL 是否指向 OpenAI 兼容端点（通常以 /v1 结尾）。${tail}`;
    case "rate_limit":
      return `请求过于频繁（429）：已触发服务端限流，稍后再试或换一个密钥。${tail}`;
    case "timeout":
      return `服务端超时（${status}）：上游响应太慢，可以重试或调大超时时间。${tail}`;
    case "server":
      return `服务端错误（${status}）：兼容端点内部报错，稍后重试；持续失败请查看服务端日志。${tail}`;
    case "bad_request":
      return `请求被拒绝（${status}）：通常是模型名不对、参数不支持或消息格式有误。${tail}`;
    default:
      return `请求失败（HTTP ${status}）。${tail}`;
  }
}

/** 从服务端错误体里挖出人能读的一句话（OpenAI: {error:{message}}；也有 {message} / 纯文本 / HTML） */
export function extractServerMessage(bodyText: string, maxLength = 300): string {
  const text = (bodyText ?? "").trim();
  if (!text) return "";
  try {
    const parsed: unknown = JSON.parse(text);
    const found = digMessage(parsed);
    if (found) return truncate(found, maxLength);
  } catch {
    // 不是 JSON：当纯文本处理
  }
  return truncate(text.replace(/\s+/g, " "), maxLength);
}

function digMessage(value: unknown, depth = 0): string | null {
  if (depth > 3 || value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "detail", "error_description", "msg"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  for (const key of ["error", "data", "response", "errors"]) {
    const nested = digMessage(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Retry-After: 秒数或 HTTP 日期 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

/** 是不是「被中断」这一类（用户停止 / 我们自己 abort 的两种形态） */
export function isAbortLike(error: unknown): boolean {
  if (isApiError(error)) return error.kind === "aborted";
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export interface NetworkContext {
  /** 出错时正在访问的地址，写进文案方便排查 */
  url?: string;
}

/** TypeError: fetch failed / Failed to fetch —— 浏览器与 undici 都只用这一种形态表示「没连上」 */
export function describeNetworkError(error: unknown, context: NetworkContext = {}): ApiError {
  const where = context.url ? `（${context.url}）` : "";
  const raw = error instanceof Error ? error.message : String(error);
  const hint = /certificate|self.signed|CERT_/i.test(raw)
    ? "证书校验失败：如果这是自建服务，请改用 http 或让系统信任该证书。"
    : /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)
      ? "域名解析失败：请检查 Base URL 的主机名。"
      : /ECONNREFUSED/i.test(raw)
        ? "连接被拒绝：目标端口没有服务在监听。"
        : "请检查地址、端口、网络与代理设置。";
  return new ApiError({
    kind: "network",
    message: `无法连接到自定义 API${where}。${hint}`,
    detail: raw.slice(0, 300),
    cause: error,
  });
}

/** 兜底：任何异常都变成 ApiError，UI 永远只用一种错误形态 */
export function toApiError(error: unknown, context: NetworkContext & { aborted?: boolean } = {}): ApiError {
  if (isApiError(error)) return error;
  if (isAbortLike(error) || context.aborted) {
    return new ApiError({ kind: "aborted", message: "已停止生成。", cause: error });
  }
  if (error instanceof TypeError) return describeNetworkError(error, context);
  if (error instanceof Error) {
    return new ApiError({
      kind: "unknown",
      message: `请求失败：${error.message}`,
      detail: error.message,
      cause: error,
    });
  }
  return new ApiError({ kind: "unknown", message: `请求失败：${String(error)}`, cause: error });
}
