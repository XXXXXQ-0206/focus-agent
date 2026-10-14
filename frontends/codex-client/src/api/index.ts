/**
 * 自定义 API 接入层（零依赖：fetch + ReadableStream）。
 *
 * 分层：
 *   url.ts     Base URL → 端点推导
 *   sse.ts     SSE 行/事件解码（跨分块缓冲，最容易写错的一块）
 *   stream.ts  delta → content / reasoning / tool_calls 拼接
 *   errors.ts  错误分类 + 中文文案
 *   client.ts  **唯一**发 fetch 的地方（超时、中断、错误体解析）
 *   config.ts  配置的读写与持久化（localStorage: `codex.api`）
 *
 * 换协议 / 换传输方式（比如改走主进程 IPC）时只需要替换 client.ts，
 * 上层（src/chat/runtime）拿到的事件与结果形状不变。
 */

export {
  type ApiClient,
  type ChatRequest,
  type ConnectionTestResult,
  createApiClient,
  streamChat,
  toApiToolCall,
} from "./client";
export {
  API_CONFIG_FIELDS,
  API_CONFIG_STORAGE_KEY,
  type ApiConfigField,
  type ApiConfigIssue,
  DEFAULT_API_CONFIG,
  getApiConfig,
  isApiConfigured,
  loadApiConfig,
  normalizeApiConfig,
  reloadApiConfig,
  resetApiConfig,
  saveApiConfig,
  subscribeApiConfig,
  updateApiConfig,
  validateApiConfig,
} from "./config";
export {
  ApiError,
  classifyStatus,
  describeNetworkError,
  extractServerMessage,
  isAbortLike,
  isApiError,
  messageForStatus,
  toApiError,
} from "./errors";
export { createSseDecoder, describeSseEvent, type SseDecoder, type SseEvent } from "./sse";
export { assembleChatCompletion, createChatStreamAssembler, normalizeUsage } from "./stream";
export type {
  ApiConnectionConfig,
  ApiErrorKind,
  ChatCompletionResult,
  ChatMessageParam,
  ChatStreamEvent,
  ChatToolCall,
  ChatToolCallParam,
  ModelInfo,
  ModelListResult,
  ResolvedApiConfig,
  TokenUsage,
} from "./types";
export { type ResolvedEndpoints, resolveEndpoints } from "./url";
export { useApiConfig } from "./use-api-config";
