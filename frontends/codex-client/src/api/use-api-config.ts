import { useSyncExternalStore } from "react";

import { getApiConfig, subscribeApiConfig } from "./config";
import type { ResolvedApiConfig } from "./types";

/**
 * 订阅自定义 API 配置（模块级 store，不需要 Provider —— 与 src/settings/store.ts 同一套做法）。
 * 返回值引用稳定：配置没变时不会引起重渲染。
 *
 * 用法：
 *   const config = useApiConfig();
 *   updateApiConfig({ model: "deepseek-chat" });
 */
export function useApiConfig(): ResolvedApiConfig {
  return useSyncExternalStore(subscribeApiConfig, getApiConfig, getApiConfig);
}
