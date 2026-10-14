import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { ThemeProvider } from "@/app/theme-provider";
import { artexApi, getAccessToken } from "@/artex";
import { ArtexSystemPage } from "@/artex/adapted-pages";
import { authRouteDecision } from "@/artex/auth-gate";
import { ArtexConversationPage, ArtexHomePage, ArtexTaskPage } from "@/artex/codex-adapter";
import { ArtexAgentDetailPage, ArtexAgentsPage, ArtexSystemLogsPage } from "@/artex/system-settings-pages";
import { ArtexTaskListPage } from "@/artex/task-list-page";
import { ArtexIntranetPage, ArtexSyncPage, ArtexWorkspacePage } from "@/artex/toolkit-pages";
import { InspectOverlay } from "@/debug/InspectOverlay";
import { CodexBlossom } from "@/icons";
import { ControlsGalleryPage, SettingsPage } from "@/settings";
import { AppShell } from "@/shell";
import { Button, Spinner } from "@/ui/button";
import { Input } from "@/ui/input";
import "./app.css";

type AuthRouteState = "loading" | "ready" | "login" | "init" | "offline";

/** ARTEX auth gate; after auth the visual shell is entirely the Codex renderer. */
function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<EntryRouter />} path="*" />
        </Routes>
      </BrowserRouter>
      {/* 内置检查器：Ctrl+Shift+X / ?inspect=1 启用，悬停定位组件边框与组件名 */}
      <InspectOverlay />
    </ThemeProvider>
  );
}

function EntryRouter() {
  // A persisted access token is enough to keep the shell mounted while the
  // unauthenticated status probe is in flight. Starting with a full-screen
  // spinner here caused a visible flash on every reload of an authenticated
  // session.
  const [state, setState] = useState<AuthRouteState>(() => (getAccessToken() ? "ready" : "loading"));
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const authCheckStarted = useRef(false);

  const check = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      if (options.showLoading) setState("loading");
      setError("");
      try {
        const status = await artexApi.authStatus();
        const decision = authRouteDecision(status, Boolean(getAccessToken()), window.location.pathname);
        setState(decision.state);
        if (decision.redirect && window.location.pathname !== decision.redirect) {
          navigate(decision.redirect, { replace: true });
        }
      } catch (caught) {
        // Keep an already-authenticated shell usable during a transient status
        // probe failure. Protected data requests surface their own errors, and
        // a real 401 dispatches `artex:auth-expired` below.
        if (!getAccessToken()) {
          setState("offline");
          setError(caught instanceof Error ? caught.message : "无法连接 ARTEX 服务");
        }
      }
    },
    [navigate],
  );

  useEffect(() => {
    const handleAuthExpired = () => {
      setError("");
      setState("login");
      if (window.location.pathname !== "/login") navigate("/login", { replace: true });
    };
    window.addEventListener("artex:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("artex:auth-expired", handleAuthExpired);
  }, [navigate]);

  useEffect(() => {
    // StrictMode re-runs mount effects in development. The auth request must
    // still be one-shot; route navigation is handled by the nested Routes,
    // not by restarting this gate.
    if (authCheckStarted.current) return;
    authCheckStarted.current = true;
    void check({ showLoading: !getAccessToken() });
  }, [check]);

  if (state === "loading") return <CenteredState busy label="正在连接 ARTEX 服务" />;
  if (state === "offline") {
    return (
      <CenteredState
        action={
          <Button onClick={() => void check({ showLoading: true })}>
            <span aria-hidden>↻</span>重试
          </Button>
        }
        label={error || "ARTEX 服务不可用"}
      />
    );
  }
  if (state === "init") return <InitializePage onComplete={() => void check()} />;
  if (state === "login") return <LoginPage onComplete={() => void check()} />;

  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route element={<Navigate replace to="/new" />} index />
        <Route element={<ArtexHomePage />} path="new" />
        <Route element={<ArtexHomePage />} path="chat" />
        {/* 2026-10-15：总览 / 资产 / 发现（含详情）/ 命令记录 / 审批 五个页面按用户口径**删除**。
            深链一律重定向到还活着的落点：审批 → 设置里的「审批与拦截」（队列与裁决都搬进去了），
            其余四项的数据都是"按任务"的，任务页里仍有各自的视图 ⇒ 统一回落任务列表。 */}
        <Route element={<Navigate replace to="/function/tasks" />} path="dashboard" />
        {/* ARTEX 模式对话页：首页选模式发消息 → 建对话 → 落到这里（见 codex-adapter 的
            ArtexConversationPage 头注释）。旧行为是重定向回任务列表，现在换成真实会话视图。 */}
        <Route element={<ArtexConversationPage />} path="c/:conversationId" />
        <Route element={<ArtexTaskPage />} path="task/:taskId" />
        <Route element={<ArtexTaskListPage />} path="function/tasks" />
        <Route element={<LegacyTaskDetailRoute />} path="function/tasks/detail" />
        <Route element={<ArtexTaskPage />} path="function/tasks/:taskId" />
        <Route element={<Navigate replace to="/function/tasks" />} path="scheduled" />
        <Route element={<Navigate replace to="/function/tasks" />} path="automations" />
        <Route element={<Navigate replace to="/system/tools" />} path="plugins" />
        <Route element={<Navigate replace to="/system/skills" />} path="skills" />
        <Route element={<Navigate replace to="/function/tasks" />} path="explore" />
        <Route element={<Navigate replace to="/function/tasks" />} path="review" />
        <Route element={<Navigate replace to="/function/tasks" />} path="pull-requests" />
        {/* 原生设置页：/settings 走默认分区（常规），:section 为分区 slug（含 ARTEX 服务端四个分区）。 */}
        <Route element={<SettingsPage />} path="settings" />
        <Route element={<SettingsPage />} path="settings/:section" />
        {/* 控件库（/controls）：控件标本台，不是设置分区 —— 左栏「还原工程（附加）」里那一行
            就指到这里（`to: "/controls"`）。此前这条路由被重定向回了 /settings，点进去没反应，
            2026-10-15 用户要求恢复成真页面。 */}
        <Route element={<ControlsGalleryPage />} path="controls" />
        <Route element={<Navigate replace to="/function/tasks" />} path="assets" />
        <Route element={<Navigate replace to="/function/tasks" />} path="findings" />
        <Route element={<Navigate replace to="/settings/approvals" />} path="approvals" />
        <Route element={<Navigate replace to="/function/tasks" />} path="function/assets" />
        <Route element={<Navigate replace to="/function/tasks" />} path="function/findings" />
        <Route element={<Navigate replace to="/function/tasks" />} path="function/findings/detail" />
        <Route element={<ArtexSystemPage kind="traffic" />} path="function/traffic" />
        <Route element={<Navigate replace to="/settings/approvals" />} path="system/intercept/approvals" />
        {/* 2026-10-15：LLM / MCP 两个配置型页面并入设置（用户要求），旧深链重定向。
            工具（system/tools）、技能（system/skills）与 Agent 页（system/agents*）保留在探索里：
            技能先被并入设置，随后用户要求「做成和工具类似的卡片，还原到里面去」⇒ 已还原。 */}
        <Route element={<Navigate replace to="/settings/llm" />} path="system/llm" />
        <Route element={<Navigate replace to="/settings/plugins" />} path="system/mcp" />
        <Route element={<ArtexSystemPage kind="tools" />} path="system/tools" />
        <Route element={<ArtexSystemPage kind="skills" />} path="system/skills" />
        {/* 旧 ARTEX 设置深链 → 原生设置骨架里的第一个 ARTEX 分区。 */}
        <Route element={<Navigate replace to="/settings/artex-traffic" />} path="system/settings" />
        <Route element={<Navigate replace to="/settings/artex-traffic" />} path="system/settings/*" />
        <Route element={<ArtexAgentsPage />} path="system/agents" />
        <Route element={<Navigate replace to="/system/agents" />} path="system/agents/detail" />
        <Route element={<ArtexAgentDetailPage />} path="system/agents/:key" />
        <Route element={<ArtexSystemLogsPage />} path="system/logs" />
        <Route element={<ArtexWorkspacePage />} path="function/workspace" />
        <Route element={<Navigate replace to="/function/tasks" />} path="function/commands" />
        {/* 同步页保留（挑目标 + 执行），配置部分在 /settings/sync */}
        <Route element={<ArtexSyncPage />} path="function/sync" />
        <Route element={<ArtexIntranetPage />} path="intranet" />
        <Route element={<UnknownRoutePage />} path="*" />
      </Route>
    </Routes>
  );
}

function CenteredState({ label, busy, action }: { label: string; busy?: boolean; action?: ReactNode }) {
  return (
    <main className="artex-centered-state">
      {busy ? <Spinner size="lg" /> : <CodexBlossom size={30} />}
      <p>{label}</p>
      {action}
    </main>
  );
}

function LoginPage({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState("ARTEX");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await artexApi.login(username.trim(), password);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <CodexBlossom size={28} />
          <span>ARTEX</span>
        </div>
        <div className="auth-heading">
          <p className="auth-kicker">SECURITY WORKSPACE</p>
          <h1>登录 ARTEX</h1>
          <p>使用 ARTEX 服务账号继续。</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="artex-username">
            用户名
            <Input
              autoComplete="username"
              id="artex-username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="用户名"
              required
              size="lg"
              value={username}
            />
          </label>
          <label htmlFor="artex-password">
            密码
            <Input
              autoComplete="current-password"
              id="artex-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码"
              required
              size="lg"
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button block color="primary" loading={loading} size="lg" type="submit" variant="solid">
            登录
          </Button>
        </form>
      </section>
    </main>
  );
}

function InitializePage({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) {
      setError(password.length < 8 ? "密码至少需要 8 位" : "两次输入的密码不一致");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await artexApi.initPassword(password);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "初始化失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <CodexBlossom size={28} />
          <span>ARTEX</span>
        </div>
        <div className="auth-heading">
          <p className="auth-kicker">FIRST RUN</p>
          <h1>初始化服务</h1>
          <p>设置本机 ARTEX 管理密码。</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="artex-init-password">
            管理密码
            <Input
              autoComplete="new-password"
              id="artex-init-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              required
              size="lg"
              type="password"
              value={password}
            />
          </label>
          <label htmlFor="artex-init-confirm">
            确认密码
            <Input
              autoComplete="new-password"
              id="artex-init-confirm"
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="再次输入密码"
              required
              size="lg"
              type="password"
              value={confirm}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button block color="primary" loading={loading} size="lg" type="submit" variant="solid">
            完成初始化
          </Button>
        </form>
      </section>
    </main>
  );
}

function LegacyTaskDetailRoute() {
  const [search] = useSearchParams();
  const taskId = search.get("id");
  if (!taskId) return <Navigate replace to="/function/tasks" />;
  const tab = search.get("tab");
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return <Navigate replace to={`/task/${encodeURIComponent(taskId)}${query}`} />;
}

function UnknownRoutePage() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <main className="cx-page artex-route-not-found">
      <section className="cx-page__column">
        <p className="page-kicker">ARTEX / ROUTE</p>
        <h1>此页面尚未接入客户端</h1>
        <p>{location.pathname} 没有对应的 ARTEX 工作区页面。</p>
        <Button onClick={() => navigate("/function/tasks")} variant="surface">
          返回任务
        </Button>
      </section>
    </main>
  );
}

export { App };
