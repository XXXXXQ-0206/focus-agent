import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "dark" | "light";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "codex.theme";

/**
 * preload 暴露的系统主题桥（`electron/preload.ts:355-361`，与你上一步补的推送点同一条链）：
 * - `getSystemThemeVariant()`：同步读数（`"dark" | "light"`，来自主进程 `nativeTheme.shouldUseDarkColors`）；
 * - `subscribeToSystemThemeVariant(listener)`：订阅系统主题变化，**回调无参**，返回退订函数。
 *
 * 官方渲染层用法同名同形（`app-initial-25361a10f2bf.js` @4,302,873..4,304,473 的 `Pgr`/`Ngr`）。
 * `src/**` 里没有 electronBridge 的全局声明，这里就地声明**最小** interface（不改 `electron/**`）。
 */
interface SystemThemeBridge {
  getSystemThemeVariant?: () => "dark" | "light";
  subscribeToSystemThemeVariant?: (listener: () => void) => (() => void) | undefined;
}

function systemThemeBridge(): SystemThemeBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { electronBridge?: SystemThemeBridge }).electronBridge;
  return bridge ?? null;
}

/** 官方 `Pgr()`：优先 preload 的同步读数，取不到再退回 `matchMedia`。 */
function systemPrefersDark() {
  const variant = systemThemeBridge()?.getSystemThemeVariant?.();
  if (variant === "dark" || variant === "light") return variant === "dark";
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 官方 `Ngr()`：优先 preload 的订阅（**回调无参**），取不到再退回 `matchMedia` 的 change。 */
function subscribeSystemTheme(onChange: () => void): () => void {
  const subscribe = systemThemeBridge()?.subscribeToSystemThemeVariant;
  if (subscribe != null) {
    const unsubscribe = subscribe(onChange);
    return typeof unsubscribe === "function" ? unsubscribe : () => {};
  }
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

/**
 * 主题：官方在 <html> 上用 data-theme=dark 表达深浅，并保证首帧不闪。
 * 这里对齐同一语义（data-theme + data-reduced-motion）。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // 默认档 = 官方**有效缺省** `system`（task-78 收口，之前本工程写死 "dark" 是偏差）：
    // 官方设置注册表 `XN.theme` = app-shared-40678a67f0e3.js @2995547
    //   `EN({ agentAccess: "read-write", default: "system", key: "appearanceTheme", schema: ["system","light","dark"] })`
    if (typeof window === "undefined") return "system";
    return (window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
  });
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    // 官方只在「系统」档订阅（显式 dark/light 档不订阅）。
    // 回调无参 ⇒ 收到通知后**重新读 getter**，与官方 `Ngr` 的用法一致。
    if (mode !== "system") return;
    return subscribeSystemTheme(() => setSystemDark(systemPrefersDark()));
  }, [mode]);

  const resolved: "dark" | "light" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.classList.toggle("dark", resolved === "dark");
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, resolved]);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
