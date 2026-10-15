import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { artexApi } from "@/artex/api";
import { Feedback, ReloadButton, useArtexSettings } from "@/artex/settings-panes";
import type { Credential, ShellSession, TunnelInfo } from "@/artex/types";
import { desktop } from "@/shell/desktop-bridge";
import { Button, Input } from "@/ui";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneConfirmAction,
  PaneEmpty,
  PaneInputRow,
  PaneRow,
  PaneSection,
  PaneShell,
  PaneSwitch,
  PaneValueText,
} from "./pane-kit";

/**
 * 连接（官方 slug connections）—— 本工程重做成 **ARTEX 远程连接**。
 *
 * 官方这页是「ChatGPT 远程控制这台 Mac / 可控制的设备 / SSH / WSL」；本工程没有账号域，
 * 但 ARTEX 有真实的远程通道（server/server.go:970-984），这页就渲染它们：
 *   · 内网会话（`GET /api/sessions`）：id / 平台 / 状态 / 心跳 + 打开内网会话（/intranet）
 *   · 隧道（`GET /api/tunnels`）：监听口 / 类型 / 状态 / 目标 + **拆除**（确认框；真实断隧道）
 *   · 凭据（`GET /api/credentials`）：类型 / 用户名@域 / **脱敏密文**（服务端只给 secret_masked，
 *     本页原样显示，绝不回显明文）
 *
 * ⚠️ 「项目 SSH 直连」**没有做**：后端没有创建 SSH 连接的通道（`rg -i ssh server` 只有
 * 凭据类型 ssh_key 与端口审计里的 22 端口说明，没有连接管理 API）；会话是由 ARTEX 运行时
 * 与内网会话页建立的。所以这里不摆一个点了没用的「新建 SSH 连接」按钮，
 * 只在页面上把这份限制写清楚（用户口径：做不了的不装样子）。
 */
export function ConnectionsPane({ section }: SettingsPaneProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTunnel, setBusyTunnel] = useState<string | null>(null);
  // 服务端设置（上游代理 / 流量捕获 / 脚本运行时）—— 与 ARTEX 服务端设置页共用同一套取数保存
  const server = useArtexSettings();
  const [globalProxy, setGlobalProxy] = useState("");
  const [python, setPython] = useState("");
  /** 浏览器降级：没有原生选择器时，「选择」把这一行切到手填输入框 */
  const [editingPython, setEditingPython] = useState(false);
  const serverUnavailable = server.loading || server.saving || !server.settings;

  useEffect(() => {
    if (!server.settings) return;
    setGlobalProxy(server.settings.global_proxy ?? "");
    setPython(server.settings.python_interpreter ?? "");
  }, [server.settings]);

  const detectPython = async () => {
    try {
      const result = await artexApi.detectPython();
      setPython(result.python_interpreter);
      await server.save({ python_interpreter: result.python_interpreter });
    } catch (caught) {
      server.fail(caught instanceof Error ? caught.message : "检测失败");
    }
  };

  /**
   * 「选择」：桌面端 → Electron 原生文件对话框（返回绝对路径后立即保存）；
   * 浏览器（没有 window.codexDesktop）→ 切到页内手填。
   */
  const pickPython = async () => {
    const picked = await desktop.pickPath("file", "选择 Python 解释器");
    if (picked) {
      setPython(picked);
      return;
    }
    setEditingPython(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionList, tunnelList, credentialList] = await Promise.all([
        artexApi.shellSessions().catch(() => [] as ShellSession[]),
        artexApi.tunnels().catch(() => [] as TunnelInfo[]),
        artexApi.credentials().catch(() => [] as Credential[]),
      ]);
      setSessions(sessionList);
      setTunnels(tunnelList);
      setCredentials(credentialList);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法加载远程连接");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const teardown = async (tunnel: TunnelInfo) => {
    setBusyTunnel(tunnel.id);
    try {
      await artexApi.teardownTunnel(tunnel.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "拆除隧道失败");
    } finally {
      setBusyTunnel(null);
    }
  };

  return (
    <PaneShell
      actions={
        <>
          <Button color="secondary" onClick={() => navigate("/intranet")} size="sm" variant="soft">
            打开内网会话
          </Button>
          <ReloadButton
            disabled={server.loading || server.saving}
            onClick={() => {
              void server.load();
              void load();
            }}
          />
        </>
      }
      lede="同一条链路的五个段落：上游代理与脚本运行时、流量捕获、内网会话、隧道与凭据。"
      section={section}
      title="连接与流量"
    >

      {/* ── 上游代理（原「上游连接 → 代理」）────────────────────────────── */}
      <PaneSection description="浏览器自动化与目标流量出去时走的代理；也是流量捕获的落点。" title="上游代理">
        <PaneCard>
          <PaneRow
            control={
              <span className="cx-pane__input-group">
                <Input
                  aria-label="全局代理地址"
                  className="cx-pane__input cx-pane__input--w240"
                  disabled={serverUnavailable}
                  onChange={(event) => setGlobalProxy(event.target.value)}
                  placeholder="http://127.0.0.1:7890"
                  size="sm"
                  value={globalProxy}
                />
                <Button
                  color="secondary"
                  disabled={serverUnavailable || globalProxy === (server.settings?.global_proxy ?? "")}
                  onClick={() => void server.save({ global_proxy: globalProxy.trim() })}
                  size="sm"
                  variant="soft"
                >
                  保存
                </Button>
              </span>
            }
            description="所有目标流量使用的上游代理；留空表示直连。"
            label="全局代理"
          />
        </PaneCard>
      </PaneSection>

      {/* ── 流量与证据（原「流量与证据」整页）────────────────────────────── */}
      <PaneSection
        description="记录并代理 ARTEX 任务的 HTTP 流量，并决定证据是否自动关联。"
        title="流量与证据"
      >
        <PaneCard>
          <PaneRow
            control={
              <PaneSwitch
                checked={server.settings?.traffic_capture ?? false}
                disabled={serverUnavailable}
                label="流量捕获"
                onChange={(value) =>
                  void server.save({ traffic_capture: value })
                }
              />
            }
            description="记录并代理 ARTEX 任务的 HTTP 流量。"
            label="流量捕获"
          />
          <PaneRow
            control={
              <PaneSwitch
                checked={server.settings?.agent_traffic_binding ?? false}
                disabled={serverUnavailable}
                label="Agent 自动绑定流量"
                onChange={(value) =>
                  void server.save({ agent_traffic_binding: value })
                }
              />
            }
            description="允许 Agent 将捕获的请求自动关联到发现记录。"
            label="Agent 自动绑定流量"
          />
        </PaneCard>
      </PaneSection>

      {/*
        ── 脚本运行时（原「上游连接 → 运行时」）──────────────────────────────
        路径字段的展现方式按用户 2026-10-15 的要求改成官方样式：**值文本 + 「选择」按钮**，
        而不是一颗裸的可编辑输入框（官方「无项目任务文件夹」那一行的写法，见 PaneValueText 注释）。
        「选择」优先走桌面端的原生对话框（desktop.pickPath → Electron dialog.showOpenDialog）；
        浏览器里没有原生通道，点「选择」退化为**页内手填**（行内出现输入框 + 保存），
        这样 Web 端依然可用，桌面端默认就是官方那种"路径 + 选择"的形态。
      */}
      <PaneSection description="自定义脚本工具调用的解释器；留空时由运行时自动检测。" title="脚本运行时">
        <PaneCard>
          {editingPython ? (
            <PaneInputRow
              ariaLabel="Python 解释器路径"
              description="手填路径后保存；桌面端点「选择」可直接唤起系统文件对话框。"
              label="Python 解释器"
              onChange={setPython}
              suffix={
                <span className="cx-pane__row-actions">
                  <Button
                    color="secondary"
                    disabled={serverUnavailable}
                    onClick={() => void detectPython()}
                    size="sm"
                    variant="ghost"
                  >
                    检测
                  </Button>
                  <Button
                    color="secondary"
                    disabled={serverUnavailable}
                    onClick={() => setEditingPython(false)}
                    size="sm"
                    variant="ghost"
                  >
                    取消
                  </Button>
                  <Button
                    color="primary"
                    disabled={serverUnavailable || python === (server.settings?.python_interpreter ?? "")}
                    onClick={() => {
                      void server.save({ python_interpreter: python.trim() });
                      setEditingPython(false);
                    }}
                    size="sm"
                    variant="solid"
                  >
                    保存
                  </Button>
                </span>
              }
              value={python}
              width={320}
            />
          ) : (
            <PaneRow
              control={
                <span className="cx-pane__row-actions">
                  <PaneValueText mono title={python || "自动检测"} value={python || "自动检测"} />
                  <Button
                    color="secondary"
                    disabled={serverUnavailable}
                    onClick={() => void pickPython()}
                    size="sm"
                    variant="soft"
                  >
                    选择
                  </Button>
                  <Button
                    color="secondary"
                    disabled={serverUnavailable}
                    onClick={() => void detectPython()}
                    size="sm"
                    variant="ghost"
                  >
                    检测
                  </Button>
                </span>
              }
              description="点「选择」用系统对话框挑解释器（浏览器里退化为页内手填）；「检测」让后端自动探测并保存。"
              label="Python 解释器"
            />
          )}
        </PaneCard>
      </PaneSection>

      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="无法加载内网会话"
          tone="danger"
        />
      ) : null}

      <PaneSection
        description={`${String(sessions.length)} 个会话；在输入回调、交互式 shell 都走这条通道`}
        title="内网会话"
      >
        <PaneCard>
          {loading && sessions.length === 0 ? (
            <PaneEmpty description="正在读取 ARTEX 的会话列表。" title="正在加载…" />
          ) : sessions.length === 0 ? (
            <PaneEmpty
              description="任务在内网主机上开交互会话后，会显示在这里（代码执行仍在内网会话页里做）。"
              title="当前没有内网会话"
            />
          ) : (
            sessions.map((session) => (
              <PaneRow
                description={
                  <span>
                    {session.platform || session.kind || "—"} · {session.status || "未知状态"} · 心跳{" "}
                    {session.last_beat || "—"}
                    {session.host_asset_id ? ` · 资产 ${session.host_asset_id}` : ""}
                  </span>
                }
                key={session.id}
                label={session.id}
                control={
                  <Button color="secondary" onClick={() => navigate("/intranet")} size="sm" variant="ghost">
                    打开会话
                  </Button>
                }
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <PaneSection description={`${String(tunnels.length)} 条隧道路由（拆除会真实断开）`} title="隧道">
        <PaneCard>
          {loading && tunnels.length === 0 ? (
            <PaneEmpty description="正在读取 ARTEX 的隧道列表。" title="正在加载…" />
          ) : tunnels.length === 0 ? (
            <PaneEmpty description="内网转发建立后，隧道路由会显示在这里。" title="没有隧道" />
          ) : (
            tunnels.map((tunnel) => (
              <PaneRow
                description={
                  <span>
                    {tunnel.kind || "tunnel"} · {tunnel.state || "未知状态"}
                    {tunnel.target_host
                      ? ` · → ${tunnel.target_host}:${String(tunnel.target_port ?? "")}`
                      : ""}
                    {tunnel.via_session_id ? ` · 经由 ${tunnel.via_session_id}` : ""}
                    {tunnel.error ? ` · ${tunnel.error}` : ""}
                  </span>
                }
                key={tunnel.id}
                label={`${tunnel.listen_host || "127.0.0.1"}:${String(tunnel.listen_port)}`}
                control={
                  <PaneConfirmAction
                    confirmLabel="拆除"
                    danger
                    description="拆除后这条转发立即失效；依赖它的会话可能随之断开。"
                    onConfirm={() => void teardown(tunnel)}
                    title={`拆除隧道 ${tunnel.listen_host || "127.0.0.1"}:${String(tunnel.listen_port)}？`}
                    trigger={
                      <Button color="danger" disabled={busyTunnel === tunnel.id} size="sm" variant="ghost">
                        拆除
                      </Button>
                    }
                  />
                }
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <PaneSection
        description={`${String(credentials.length)} 条凭据（只显示脱敏后的密文，明文永不回显）`}
        title="凭据"
      >
        <PaneCard>
          {loading && credentials.length === 0 ? (
            <PaneEmpty description="正在读取 ARTEX 的凭据库。" title="正在加载…" />
          ) : credentials.length === 0 ? (
            <PaneEmpty description="平台在利用过程中登记成功的凭据会显示在这里。" title="尚无凭据" />
          ) : (
            credentials.map((credential) => (
              <PaneRow
                description={
                  <span>
                    {credential.cred_type} · {credential.secret_masked || "（未返回密文）"}
                    {credential.source ? ` · 来源 ${credential.source}` : ""}
                    {credential.verified ? " · 已验证" : ""}
                  </span>
                }
                key={credential.id}
                label={`${credential.username || "—"}${credential.domain ? ` @ ${credential.domain}` : ""}`}
              />
            ))
          )}
        </PaneCard>
      </PaneSection>

      <PaneBanner
        description="后端没有创建 SSH 连接的接口（sessions 由运行时与内网会话页建立），所以这里不提供「新建 SSH 连接」入口，避免做一个点了没用的按钮。"
        title="关于项目 SSH"
        tone="info"
      />
    </PaneShell>
  );
}
