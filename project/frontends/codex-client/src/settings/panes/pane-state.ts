import { useCallback, useEffect, useState } from "react";

/**
 * 15 个取证页的本地状态（**C2 私有**，刻意不复用 C1 的 src/settings/store.ts，避免耦合）。
 *
 * 契约：
 *   · 每个分区一个 localStorage 键 `cx.pane.<section>`，值 = JSON 对象；
 *   · 读取失败 / 无值 → 回退到页面默认值；写入失败（隐私模式、配额满）不抛错，
 *     由 isPaneStorageAvailable() 报告，页面继续在内存里自洽；
 *   · 同一分区的多个订阅者通过模块级事件表同步（同标签页内即时，跨标签页靠 storage 事件）。
 *
 * 官方侧证据：本机参考端设置页只有「常规」有 DOM 实测，其余 17 页
 * **没有任何运行时状态证据**（docs/SPEC-SETTINGS.md §8.2），所以这里的默认值
 * 全部是「按官方文案语义取的第一项」，不是官方默认值 —— 每页注释里逐条标注。
 */

const STORAGE_PREFIX = "cx.pane.";
let writeFailed = false;
const listeners = new Map<string, Set<() => void>>();

export function paneStorageKey(section: string): string {
  return STORAGE_PREFIX + section;
}

/** localStorage 是否可写（隐私模式/配额满时为 false） */
export function isPaneStorageAvailable(): boolean {
  return !writeFailed;
}

function notify(section: string) {
  const set = listeners.get(section);
  if (set) for (const fn of set) fn();
}

/** 读取分区状态；对象型默认值走浅合并，列表/标量型直接取存储值 */
export function readPaneState<T>(section: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(paneStorageKey(section));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (parsed === null || parsed === undefined) return fallback;
    const isPlainObject = typeof parsed === "object" && !Array.isArray(parsed);
    const isDefaultObject = typeof fallback === "object" && fallback !== null && !Array.isArray(fallback);
    if (isPlainObject && isDefaultObject) return { ...fallback, ...parsed };
    return parsed;
  } catch {
    // 存储被禁用或 JSON 损坏：按默认值渲染，不打断页面
    return fallback;
  }
}

export function writePaneState<T>(section: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(paneStorageKey(section), JSON.stringify(value));
    writeFailed = false;
  } catch {
    // 隐私模式 / 配额满：状态只留在内存
    writeFailed = true;
  }
  notify(section);
}

export function clearPaneState(section: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(paneStorageKey(section));
  } catch {
    writeFailed = true;
  }
  notify(section);
}

/**
 * 分区状态 hook。
 *   const [s, patch, reset] = usePaneState("git", DEFAULTS);
 *   patch({ forcePush: true })          // 浅合并
 *   patch((prev) => ({ ...prev, ... })) // 函数式
 */
export function usePaneState<T>(
  section: string,
  defaults: T,
): readonly [T, (patch: Partial<T> | ((prev: T) => T)) => void, () => void] {
  const [state, setState] = useState<T>(() => readPaneState(section, defaults));

  useEffect(() => {
    setState(readPaneState(section, defaults));
    const fn = () => setState(readPaneState(section, defaults));
    let set = listeners.get(section);
    if (!set) {
      set = new Set();
      listeners.set(section, set);
    }
    set.add(fn);
    const onStorage = (event: StorageEvent) => {
      if (event.key === paneStorageKey(section)) fn();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      set?.delete(fn);
      window.removeEventListener("storage", onStorage);
    };
  }, [section, defaults]);

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof patch === "function" ? (patch as (p: T) => T)(prev) : { ...prev, ...(patch as T) };
        writePaneState(section, next);
        return next;
      });
    },
    [section],
  );

  const reset = useCallback(() => {
    clearPaneState(section);
    setState(defaults);
  }, [section, defaults]);

  return [state, update, reset] as const;
}

/** 列表项稳定 id（Chromium/Electron 有 crypto.randomUUID） */
export function newPaneId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}
