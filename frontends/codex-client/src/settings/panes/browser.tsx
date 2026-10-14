import { useCallback, useEffect, useState } from "react";

import { artexApi } from "@/artex/api";
import type { MCPServer, MCPTool } from "@/artex/types";
import { Button } from "@/ui";
import type { SettingsPaneProps } from "./index";
import {
  PaneBanner,
  PaneCard,
  PaneEmpty,
  PaneRow,
  PaneSection,
  PaneShell,
  PaneSwitch,
  PaneValueText,
} from "./pane-kit";

/**
 * 浏览器（官方 slug browser-use）—— 本工程重做成 **Playwright MCP 的真实管理页**。
 *
 * 为什么这页能做真：ARTEX 后端首次启动时会种入一台名为 `browser` 的 MCP 服务器
 * （`npx @playwright/mcp --headless`，默认关闭，见 db/db.go:270-280），抓包开关打开时
 * 后端还会自动给它注入录制代理参数与 MITM CA 环境变量（server/manager.go 的
 * syncBrowserMCPProxy）。所以这一页不是复刻官方 ChatGPT 的浏览器权限/历史，
 * 而是**这台浏览器自动化服务器的控制面板**：
 *   · 状态：启用 / 停用（`/api/mcp` 真实写库）；启动命令与参数只读展示；
 *   · 工具：`/api/mcp/{id}/refresh` 拉 Playwright 暴露的工具清单（含是否已缓存）；
 *   · 说明：默认关闭、抓包接线由后端自动完成 —— 这两条都是后端行为，不是本页猜的。
 */
export function BrowserPane({ section }: SettingsPaneProps) {
  const [server, setServer] = useState<MCPServer | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const servers = await artexApi.mcpServers();
      // 认名字：后端种的就是 browser（用户改名/删除后这页退回空态，不猜别的服务器）
      const found = servers.find((item) => item.name === "browser") ?? null;
      setServer(found);
      setTools(found?.tools ? found.tools.map((name) => ({ name, description: "" })) : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法加载浏览器 MCP");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    if (!server) return;
    setBusy(true);
    try {
      await artexApi.saveMcpServer({ ...server, enabled });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const refreshTools = async () => {
    if (!server) return;
    setBusy(true);
    try {
      setTools(await artexApi.refreshMcpServer(server.id));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "刷新工具失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaneShell
      actions={
        <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
          刷新
        </Button>
      }
      lede="内置的 Playwright 浏览器自动化服务器：Agent 通过它打开网页、点击与截图。"
      section={section}
      title="浏览器"
    >
      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="无法加载浏览器 MCP"
          tone="danger"
        />
      ) : null}

      <PaneSection
        description={
          server ? (server.enabled ? "已启用：Agent 可以调用浏览器工具" : "已停用") : "未找到 browser 服务器"
        }
        title="浏览器自动化（Playwright MCP）"
      >
        <PaneCard>
          {loading && !server ? (
            <PaneEmpty description="正在读取 ARTEX 的 MCP 配置。" title="正在加载…" />
          ) : !server ? (
            <PaneEmpty
              description="后端首次启动会种入名为 browser 的 Playwright MCP；它可能已被改名或删除。可在「插件」页查看当前 MCP 列表。"
              title="没有 browser 服务器"
            />
          ) : (
            <>
              <PaneRow
                control={
                  <PaneSwitch
                    checked={server.enabled}
                    disabled={busy}
                    label="启用浏览器自动化"
                    onChange={(checked) => void toggle(checked)}
                  />
                }
                description="关闭时 Agent 看不到任何浏览器工具（默认关闭，需要时再开）"
                label="启用"
              />
              <PaneRow
                control={
                  <PaneValueText
                    title={`${server.command ?? ""} ${(server.args ?? []).join(" ")}`.trim()}
                    value={`${server.command ?? "—"} ${(server.args ?? []).join(" ")}`.trim()}
                  />
                }
                description="后端种入的启动命令；开了流量抓包后，运行时会自动追加代理参数与 CA 环境变量"
                label="启动命令"
              />
              <PaneRow
                control={<PaneValueText value={server.transport} />}
                description="stdio：浏览器作为子进程由 ARTEX 拉起"
                label="传输方式"
              />
            </>
          )}
        </PaneCard>
      </PaneSection>

      <PaneSection
        actions={
          <Button
            color="secondary"
            disabled={busy || !server}
            onClick={() => void refreshTools()}
            size="sm"
            variant="soft"
          >
            刷新工具
          </Button>
        }
        description={
          tools.length > 0
            ? `当前缓存 ${String(tools.length)} 个工具`
            : "尚未缓存：点「刷新工具」让后端拉起服务器并读取工具清单"
        }
        title="工具"
      >
        <PaneCard>
          {tools.length === 0 ? (
            <PaneEmpty
              action={
                <Button
                  color="primary"
                  disabled={busy || !server}
                  onClick={() => void refreshTools()}
                  size="sm"
                  variant="solid"
                >
                  刷新工具
                </Button>
              }
              description="刷新会启动一次 Playwright MCP（npx 首次可能要下载依赖），把可用工具写进缓存。"
              title="工具清单为空"
            />
          ) : (
            tools.map((tool) => (
              <PaneRow description={tool.description || undefined} key={tool.name} label={tool.name} />
            ))
          )}
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
