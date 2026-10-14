import { useSyncExternalStore } from "react";

/**
 * 当前 ARTEX「模式」（= 对话 agent key，如 `auto` / `pentest`）。
 *
 * 口径（对应原版站点 frontends/artex-web/src/app/(main)/chat/page.tsx:384：
 * `if (!agentKey && agents.some(a => a.key === "auto")) setAgentKey("auto")`）：
 *   · 默认 `auto`；
 *   · 选择落在本机 `localStorage`（键 `codex.artex.mode`），刷新/重启客户端后保持；
 *     原版站点每次进页面都回到 Auto —— 这里是**有意**的 Codex 式增强（选择要能记住），
 *     已在验收记录里声明为偏差；
 *   · 读取时不做 agent 合法性校验（agent 列表要联网取），由调用方在列表到手后回落：
 *     存着的 key 不在列表里 ⇒ 显示 Auto / 列表首项，并把选择写回。
 *
 * 模块级外部 store（`useSyncExternalStore`），与 `use-sidebar` /
 * `use-rail-pinned` 同一套口径：任意组件调用都拿到同一份快照。
 */

const STORAGE_KEY = "codex.artex.mode";

/** 官方内置的默认模式（server/db.go:227-228 的 assistant 内置 agent 之一） */
export const ARTEX_DEFAULT_MODE = "auto";

type Listener = () => void;

const listeners = new Set<Listener>();

function read(): string {
  if (typeof window === "undefined") return ARTEX_DEFAULT_MODE;
  return window.localStorage.getItem(STORAGE_KEY) || ARTEX_DEFAULT_MODE;
}

let mode = read();

const getSnapshot = () => mode;
const getServerSnapshot = () => ARTEX_DEFAULT_MODE;

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setArtexMode(next: string) {
  const value = next.trim();
  if (!value || value === mode) return;
  mode = value;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, value);
  for (const listener of listeners) listener();
}

/** 当前模式 key（agent_key）。 */
export function useArtexMode(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
