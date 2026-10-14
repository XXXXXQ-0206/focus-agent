import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useTheme } from "@/app/theme-provider";
import { useCommandHost } from "@/settings/commands";

import { PageSurface } from "./PageSurface";
import { pageLayoutFor } from "./page-layouts";
import { SearchDialog } from "./SearchDialog";
import { SidebarPanel } from "./SidebarPanel";
import { SidebarRail } from "./SidebarRail";
import { useSidebar } from "./use-sidebar";
import { useWindowChromeAttributes } from "./window-attributes";
import "./shell.css";

/**
 * 外壳骨架：三区（52px 导轨 / 浮层面板 / 圆角主表面）。
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
 * ★ 2026-10-15（用户：「不要最上面的 windows 自带菜单顶栏」）：
 *   顶部 36px 应用菜单栏（原 `<AppMenuBar />` —— DOM 自绘的 Radix Menubar：← → + 侧栏开关 +
 *   文件/编辑/视图/帮助）整条**已删除**，AppMenuBar.tsx 与 app-menus.ts 一并移除。随之而来的安置：
 *     · 返回 / 前进：菜单栏没了就没有按钮入口（键盘 Alt+← / 鼠标侧键 / 系统手势仍在）；
 *     · 侧栏开关：搬到导轨底部组最上面一枚（SidebarRail.tsx 的 RailSidebarToggle）——
 *       不放在面板头，是因为面板收起后它自己的开关随之消失 ⇒ 死胡同，而导轨始终可见。
 *   历史说明（当年为什么在 /settings 上单独补开关）保留在 shell.css 的对应段落里。
 */
export function AppShell() {
  const { inset, resizing } = useSidebar();
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
