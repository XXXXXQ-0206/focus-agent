import { ApiError } from "./errors";

/**
 * Base URL → 具体端点的推导规则。
 *
 * 为什么要推导：用户填的地址形态五花八门，下面四种都要能work
 * （这些是**兼容性规则**，不是官方数值）：
 *
 *   https://api.deepseek.com          → https://api.deepseek.com/v1/chat/completions
 *   https://api.deepseek.com/v1       → https://api.deepseek.com/v1/chat/completions
 *   http://127.0.0.1:11434/v1/        → http://127.0.0.1:11434/v1/chat/completions
 *   http://host/v1/chat/completions   → 原样使用（认为用户要自己控制端点，另一端由它推导）
 *
 * 已知边界（未实测，故意不支持）：
 *   · 带 query 的地址（Azure OpenAI 的 `?api-version=` 形态）—— 拆 query 会让规则变难懂，
 *     需要时请直接填完整 chat 端点，或在「自定义请求头」里处理。
 *   · 非 OpenAI 路径协议（`/v1/messages` 等）—— 不是本次目标。
 */

const CHAT_PATH = "/chat/completions";
const MODELS_PATH = "/models";

export interface ResolvedEndpoints {
  chatUrl: string;
  modelsUrl: string;
}

/** `https://host/v1` 这类「已带版本段」的地址，不再追加 /v1 */
const VERSION_SEGMENT = /\/v\d+[a-z]*$/i;

/** 用户填的恰好是某个已知端点 → 两端点都由同一个根推导，保证对话与模型列表指向同一台服务 */
function endpointsFromKnownPath(raw: string, path: string): ResolvedEndpoints | null {
  if (!raw.endsWith(path)) return null;
  const root = raw.slice(0, -path.length);
  return { chatUrl: root + CHAT_PATH, modelsUrl: root + MODELS_PATH };
}

export function resolveEndpoints(baseUrl: string): ResolvedEndpoints {
  const raw = (baseUrl ?? "").trim().replace(/\/+$/, "");

  if (!raw) {
    throw new ApiError({
      kind: "config",
      message: "尚未配置自定义 API：请在「设置 → 自定义 API」里填写 Base URL 与模型名。",
    });
  }
  if (!/^https?:\/\//i.test(raw)) {
    throw new ApiError({
      kind: "config",
      message: `Base URL 必须以 http:// 或 https:// 开头，当前是「${raw}」。`,
    });
  }

  const known = endpointsFromKnownPath(raw, CHAT_PATH) ?? endpointsFromKnownPath(raw, MODELS_PATH);
  if (known) return known;

  const base = VERSION_SEGMENT.test(raw) ? raw : `${raw}/v1`;
  return { chatUrl: base + CHAT_PATH, modelsUrl: base + MODELS_PATH };
}
