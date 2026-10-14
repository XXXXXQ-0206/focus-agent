import { useCallback, useEffect, useState } from "react";

import { artexApi } from "@/artex/api";
import type { MCPServer } from "@/artex/types";
import { Button, Dialog, DialogContent, Input, Textarea } from "@/ui";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneConfirmAction,
  PaneEmpty,
  type PaneOption,
  PaneRow,
  PaneSection,
  PaneSelect,
  PaneShell,
  PaneSwitch,
} from "./pane-kit";

/** MCP 传输类型（server 端取值：stdio / http / sse） */
const TRANSPORT_OPTIONS: PaneOption[] = [
  { value: "stdio", label: "stdio", description: "本机命令 + 参数" },
  { value: "http", label: "http", description: "远程 HTTP 端点" },
  { value: "sse", label: "sse", description: "Server-Sent Events 端点" },
];

/**
 * 插件（官方 slug plugins-settings）。
 *
 * ── 2026-10-14 重做（用户口径：能做就做、做不了就删）────────────────────────
 * 官方这一页是「插件 / 技能」两 tab 的 ChatGPT 插件市场 + MCP 应用列表（SPEC §4.2.9），
 * 本工程没有插件市场也没有账号域 —— 但**有真实等价物**：ARTEX 后端自己管理 MCP 服务器
 * （`/api/mcp`：列表 / 保存 / 删除 / 刷新工具，见 server/server.go 的 mcp 路由）。
 * 所以这一页不再摆一排装饰性的假开关，而是照 Codex 的 pane 规格渲染 **ARTEX 的 MCP 服务器**：
 *   · 每台服务器一行：名称 + 传输/命令（或 URL）+ 工具数；
 *   · 右侧：启用开关（`saveMcpServer`，真实写库）+「刷新工具」（`refreshMcpTools`）
 *     + 删除（确认框，`deleteMcpServer`）；
 *   · 空态/错误态与官方同款（卡片内空态 + 顶部危险色 banner + 重试）。
 *
 * 读取是**服务端真实数据**，没有任何 localStorage 影子状态：
 * 本页的 `usePaneState` 依赖为 0，操作后一律重新拉 `/api/mcp` 以服务端为准。
 */
export function PluginsPane({ section }: SettingsPaneProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  // 添加 / 编辑对话框：`editing === null` 时是「添加」，否则是编辑该条目。
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MCPServer | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTransport, setDraftTransport] = useState<MCPServer["transport"]>("stdio");
  const [draftCommand, setDraftCommand] = useState("");
  const [draftArgs, setDraftArgs] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftEnv, setDraftEnv] = useState("");
  const [draftInsecure, setDraftInsecure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServers(await artexApi.mcpServers());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法加载 MCP 服务器");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (server: MCPServer, enabled: boolean) => {
    setBusyId(server.id);
    try {
      await artexApi.saveMcpServer({ ...server, enabled });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存 MCP 服务器失败");
    } finally {
      setBusyId(null);
    }
  };

  const refreshTools = async (server: MCPServer) => {
    setBusyId(server.id);
    try {
      const tools = await artexApi.refreshMcpServer(server.id);
      setServers((current) =>
        current.map((item) =>
          item.id === server.id ? { ...item, tools: tools.map((tool) => tool.name) } : item,
        ),
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "刷新 MCP 工具失败");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (server: MCPServer) => {
    setBusyId(server.id);
    try {
      await artexApi.deleteMcpServer(server.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除 MCP 服务器失败");
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDraftName("");
    setDraftTransport("stdio");
    setDraftCommand("");
    setDraftArgs("");
    setDraftUrl("");
    setDraftEnv("");
    setDraftInsecure(false);
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (server: MCPServer) => {
    setEditing(server);
    setDraftName(server.name);
    setDraftTransport(server.transport);
    setDraftCommand(server.command ?? "");
    setDraftArgs((server.args ?? []).join(" "));
    setDraftUrl(server.url ?? "");
    setDraftEnv(
      Object.entries(server.env ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    );
    setDraftInsecure(Boolean(server.insecure));
    setFormError("");
    setDialogOpen(true);
  };

  /** KEY=VALUE 行 → 环境变量对象（空行忽略；缺 = 的行报错，不静默丢掉） */
  const parseEnv = (raw: string): Record<string, string> | null => {
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const text = line.trim();
      if (!text) continue;
      const index = text.indexOf("=");
      if (index <= 0) return null;
      env[text.slice(0, index)] = text.slice(index + 1);
    }
    return env;
  };

  const save = async () => {
    const name = draftName.trim();
    if (!name) {
      setFormError("名称不能为空。");
      return;
    }
    if (draftTransport === "stdio" && !draftCommand.trim()) {
      setFormError("stdio 服务器需要启动命令。");
      return;
    }
    if (draftTransport !== "stdio" && !draftUrl.trim()) {
      setFormError("http / sse 服务器需要 URL。");
      return;
    }
    const env = parseEnv(draftEnv);
    if (env == null) {
      setFormError("环境变量要写成 KEY=VALUE，一行一条。");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await artexApi.saveMcpServer({
        ...(editing ? { id: editing.id } : {}),
        name,
        transport: draftTransport,
        command: draftTransport === "stdio" ? draftCommand.trim() : "",
        args: draftTransport === "stdio" ? draftArgs.split(/\s+/).filter(Boolean) : [],
        url: draftTransport === "stdio" ? "" : draftUrl.trim(),
        env,
        insecure: draftInsecure,
        enabled: editing ? editing.enabled : true,
      });
      setDialogOpen(false);
      await load();
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : "保存失败";
      // 名称是库里的唯一键（mcp_servers_name_key）：把 Postgres 原文换成人话
      setFormError(/mcp_servers_name_key|唯一约束/.test(raw) ? "已存在同名 MCP 服务器，换个名称。" : raw);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = servers.filter((server) => server.enabled).length;

  return (
    <PaneShell
      actions={
        <>
          <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
            刷新
          </Button>
          <Button color="primary" onClick={openCreate} size="sm" variant="solid">
            添加服务器
          </Button>
        </>
      }
      lede="连接 ARTEX 的 MCP 服务器：查看传输方式与可用工具，启停或移除连接。"
      section={section}
      title="插件"
    >
      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="无法加载 MCP 服务器"
          tone="danger"
        />
      ) : null}

      <PaneSection
        description={
          servers.length === 0
            ? "未连接 MCP 服务器"
            : `${String(servers.length)} 台服务器，其中 ${String(enabledCount)} 台已启用`
        }
        title="MCP 服务器"
      >
        <PaneCard>
          {loading && servers.length === 0 ? (
            <PaneEmpty description="正在读取 ARTEX 的 MCP 配置。" title="正在加载…" />
          ) : servers.length === 0 ? (
            <PaneEmpty
              description="点右上角「添加服务器」连接一个 MCP 服务器（stdio 命令或 http/sse 端点），保存后即在此启停与刷新工具。"
              title="未连接 MCP 服务器"
            />
          ) : (
            servers.map((server) => {
              const endpoint =
                server.transport === "stdio"
                  ? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")
                  : (server.url ?? "");
              const toolCount = server.tools?.length ?? 0;
              return (
                <PaneRow
                  description={
                    <span>
                      {server.transport}
                      {endpoint ? ` · ${endpoint}` : ""} · {toolCount} 个工具
                    </span>
                  }
                  key={server.id}
                  label={server.name}
                  control={
                    <div className="cx-pane__row-actions">
                      <Button
                        color="secondary"
                        disabled={busyId === server.id}
                        onClick={() => void refreshTools(server)}
                        size="sm"
                        variant="ghost"
                      >
                        刷新工具
                      </Button>
                      <Button
                        color="secondary"
                        disabled={busyId === server.id}
                        onClick={() => openEdit(server)}
                        size="sm"
                        variant="ghost"
                      >
                        编辑
                      </Button>
                      <PaneConfirmAction
                        confirmLabel="删除"
                        danger
                        description="删除后 ARTEX 不会再加载这台服务器的工具，需要时可重新添加。"
                        onConfirm={() => void remove(server)}
                        title={`删除 MCP 服务器「${server.name}」？`}
                        trigger={
                          <Button color="danger" disabled={busyId === server.id} size="sm" variant="ghost">
                            删除
                          </Button>
                        }
                      />
                      <PaneSwitch
                        checked={server.enabled}
                        label={`${server.name} 启用`}
                        onChange={(checked) => void toggle(server, checked)}
                      />
                    </div>
                  }
                />
              );
            })
          )}
        </PaneCard>
      </PaneSection>

      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError("");
        }}
        open={dialogOpen}
      >
        <DialogContent
          description="写入 ARTEX 的 MCP 配置（/api/mcp）；stdio 走命令 + 参数，http/sse 走 URL。"
          footer={
            <>
              <Button color="secondary" onClick={() => setDialogOpen(false)} size="sm" variant="ghost">
                取消
              </Button>
              <Button color="primary" disabled={saving} onClick={() => void save()} size="sm" variant="solid">
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
          title={editing ? `编辑 MCP 服务器 · ${editing.name}` : "添加 MCP 服务器"}
        >
          <div className="artex-task-create">
            <label className="artex-task-create__field" htmlFor="mcp-name">
              <span>名称</span>
              <Input
                id="mcp-name"
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：filesystem"
                value={draftName}
              />
            </label>
            <div className="artex-task-create__field">
              <span>类型</span>
              <PaneSelect
                ariaLabel="MCP 传输类型"
                onChange={(value) => setDraftTransport(value as MCPServer["transport"])}
                options={TRANSPORT_OPTIONS}
                value={draftTransport}
              />
            </div>
            {draftTransport === "stdio" ? (
              <>
                <label className="artex-task-create__field" htmlFor="mcp-command">
                  <span>启动命令</span>
                  <Input
                    id="mcp-command"
                    onChange={(event) => setDraftCommand(event.target.value)}
                    placeholder="例如：npx"
                    value={draftCommand}
                  />
                </label>
                <label className="artex-task-create__field" htmlFor="mcp-args">
                  <span>参数（空格分隔）</span>
                  <Input
                    id="mcp-args"
                    onChange={(event) => setDraftArgs(event.target.value)}
                    placeholder="例如：-y @modelcontextprotocol/server-filesystem C:\\data"
                    value={draftArgs}
                  />
                </label>
              </>
            ) : (
              <label className="artex-task-create__field" htmlFor="mcp-url">
                <span>URL</span>
                <Input
                  id="mcp-url"
                  onChange={(event) => setDraftUrl(event.target.value)}
                  placeholder="https://example.com/mcp"
                  value={draftUrl}
                />
              </label>
            )}
            <label className="artex-task-create__field" htmlFor="mcp-env">
              <span>环境变量（一行一条 KEY=VALUE，可留空）</span>
              <Textarea
                id="mcp-env"
                onChange={(event) => setDraftEnv(event.target.value)}
                placeholder={"API_KEY=…\nDEBUG=1"}
                rows={3}
                value={draftEnv}
              />
            </label>
            <div className="artex-task-create__switch">
              <span>允许不安全 TLS（自签名 https）</span>
              <PaneSwitch checked={draftInsecure} label="允许不安全 TLS" onChange={setDraftInsecure} />
            </div>
            {formError ? (
              <p className="artex-codex-error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </PaneShell>
  );
}
