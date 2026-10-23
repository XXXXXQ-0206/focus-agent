import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useTheme } from "@/app/theme-provider";
import { CodexSidebar, CodexSidebarHidden } from "@/icons";
import { useCommandHost } from "@/settings/commands";

import { AppMenuBar } from "./AppMenuBar";
import { PageSurface } from "./PageSurface";
import { pageLayoutFor } from "./page-layouts";
import { SearchDialog } from "./SearchDialog";
import { SidebarPanel } from "./SidebarPanel";
import { SidebarRail } from "./SidebarRail";
import { useSidebar } from "./use-sidebar";
import { useWindowChromeAttributes } from "./window-attributes";
import "./shell.css";

/**
 * 外壳骨架：顶部 36px 菜单栏 + 三区（52px 导轨 / 浮层面板 / 圆角主表面）。
 *
 * 面板是「浮」在主表面之上的（不占布局宽度）：主表面从 x=52 起，
 * 面板叠在 [52,340] 区间上，主内容面由 `--codex-surface-inset` 让位面板宽度，
 * 收起时过渡到 0（面板整体滑出屏左，见 sidebar-panel.css）—— 与参考端一致：
 * 官方主表面从导轨右缘起（shell-initial.css:3182），主内容面按左栏宽度内缩
 * （shell-initial.css:3125），左栏宽度归零时主内容面就回到导轨右缘。
 *
 * data-resizing：拖拽 resizer 期间置 true → shell.css 里关掉宽度/位移过渡，
 * 避免「手指拖一下、面板滑两下」。
 *
 * 菜单里的「新聊天 / 设置」是渲染层动作（见 desktop-bridge.ts 注释），
 * 在这里统一落成路由跳转（事件可能由托盘菜单等外部入口派发）。
 *
 * ★ 2026-10-15（用户澄清）：当初那句「不要最上面的 windows 自带菜单顶栏」指的是
 *   **Windows 自己画的标题栏**（带 Focus 标题与最小化/最大化/关闭那条），不是这条应用菜单栏。
 *   我先前误删了 `<AppMenuBar />`（当晚已按构建产物原样恢复，见 AppMenuBar.tsx 文件头），
 *   真正要关掉的 Windows 标题栏改在桌面端做：desktop/main.js 的
 *   `titleBarStyle: "hidden"` + `titleBarOverlay` —— 标题栏连同 Focus 字样一起消失，
 *   只留右上角三个系统按钮，本条 36px 菜单栏成为窗口最顶上的一条（与官方窗口形态一致，
 *   见 evidence/codex-desktop/reference-shots/ref-01-chat-home.png）。
 */
export function AppShell() {
  const { inset, resizing, collapsed, narrow, toggle } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resolved, setMode } = useTheme();
  // 应用命令（设置 → 键盘快捷键）的全局分发器：导航 / 切主题 / 开搜索 / 开检查器…
  // 挂在这里是因为这是 Router 与 ThemeProvider 的内侧，命令能拿到 navigate 与主题。
  const commandContext = useMemo(
    () => ({
      navigate: (to: string) => navigate(to),
      resolvedTheme: resolved,
      toggleTheme: () => setMode(resolved === "dark" ? "light" : "dark"),
    }),
    [navigate, resolved, setMode],
  );
  useCommandHost(commandContext);
  // 设置页的侧栏开关（用户报告 #3）：官方在 /settings 上整组摘掉这个开关，而设置导航就在
  // 同一个面板里 ⇒ 收起后没有任何入口能展开（死胡同）。这里在设置路由上把**同一个**开关
  // （同 aria-label、同图标、同 disabled 语义）渲染到官方会话页的槽位 [74,4 28×28]，
  // 见 shell.css 的 .codex-shell__sidebar-toggle（含有意偏差说明）。
  const settingsRoute =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/system/settings" ||
    pathname.startsWith("/system/settings/");
  // task-28：主表面三档 + 面板内容档，**同一处**（page-layouts.ts）按路由取，
  // 官方出处逐条写在那个文件头（/review full-bleed、/plugins|/explore inline header、/scheduled 46px + 列表进面板）。
  const layout = pageLayoutFor(pathname);
  const fullBleed = layout.surface === "full-bleed";
  // full-bleed：主表面从导轨右缘起（官方 main [52,44,1224×768]）⇒ 让位归零、不渲染面板
  const surfaceInset = fullBleed ? 0 : inset;
  // 补齐 <html> 的官方窗口属性（FIDELITY-AUDIT #129 / [C81]；不影响 token 档位，见该文件注释）
  useWindowChromeAttributes();

  useEffect(() => {
    const onNewChat = () => navigate("/new");
    const onOpenSettings = () => navigate("/settings");
    window.addEventListener("codex:new-chat", onNewChat);
    window.addEventListener("codex:open-settings", onOpenSettings);
    return () => {
      window.removeEventListener("codex:new-chat", onNewChat);
      window.removeEventListener("codex:open-settings", onOpenSettings);
    };
  }, [navigate]);

  return (
    <div
      className="codex-shell"
      data-codex-shell=""
      data-resizing={resizing ? "true" : "false"}
      style={{ "--codex-surface-inset": `${surfaceInset}px` } as CSSProperties}
    >
      <AppMenuBar />
      {/* 设置路由下的同款侧栏开关（用户报告 #3）。这里**不重复渲染**：AppMenuBar 在
          `/settings*` 上自己就不渲染那一组，所以任何时刻这个 aria-label 只对应一个按钮。 */}
      {settingsRoute ? (
        <div className="codex-shell__sidebar-toggle">
          <button
            aria-label={narrow ? "窗口过窄，侧边栏已自动收起" : collapsed ? "显示侧边栏" : "隐藏侧边栏"}
            className="codex-icon-button"
            data-settings-sidebar-toggle=""
            disabled={narrow}
            onClick={toggle}
            title={narrow ? "窗口过窄，侧边栏已自动收起" : undefined}
            type="button"
          >
            {collapsed ? <CodexSidebarHidden size={16} /> : <CodexSidebar size={16} />}
          </button>
        </div>
      ) : null}
      <div className="codex-shell__row">
        <SidebarRail />
        {fullBleed ? null : <SidebarPanel />}
        <PageSurface header={layout.header} headerHeight={layout.headerHeight} layout={layout.surface}>
          <Outlet />
        </PageSurface>
      </div>
      <SearchDialog />
    </div>
  );
}
