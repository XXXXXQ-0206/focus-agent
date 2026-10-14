import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { artexApi } from "@/artex/api";
import { Button, Input } from "@/ui";
import { SettingsSecretInput } from "../controls";
import type { SettingsPaneProps } from "./index";
import { PaneBanner, PaneCard, PaneEmpty, PaneRow, PaneSection, PaneShell, PaneValueText } from "./pane-kit";

interface SyncStatus {
  exists: boolean;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  url?: string;
  tools: string[];
}

/**
 * 同步（2026-10-15 从「探索 → 同步」把**配置部分**并入设置；执行同步仍留在原页）。
 *
 * 数据：`GET /api/sync/scopesentry/status`（数据源是否存在 / 已配置 / 启用 / 可达 / URL / 工具数）、
 *      `POST /api/sync/scopesentry/datasource`（保存 URL + API Key）。
 * 「选择项目/任务并执行同步」是操作动作（要挑目标、看进度），按用户口径不搬进设置 ——
 * 这里给一个「打开同步页」按钮直达。
 */
export function SyncPane({ section }: SettingsPaneProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await artexApi.ssStatus();
      setStatus(next);
      setUrl(next.url ?? "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取同步状态");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      await artexApi.ssDatasource({ url: url.trim(), ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}) });
      setApiKey("");
      await load();
      setNotice("数据源已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaneShell
      actions={
        <>
          <Button color="secondary" onClick={() => navigate("/function/sync")} size="sm" variant="soft">
            打开同步页
          </Button>
          <Button color="secondary" onClick={() => void load()} size="sm" variant="ghost">
            刷新
          </Button>
        </>
      }
      lede="ScopeSentry 数据源的连接配置；选择同步目标与执行同步在同步页里做。"
      section={section}
      title="同步"
    >
      {error ? (
        <PaneBanner
          action={
            <Button color="secondary" onClick={() => void load()} size="sm" variant="soft">
              重试
            </Button>
          }
          description={error}
          title="读写出错"
          tone="danger"
        />
      ) : null}
      {notice ? <PaneBanner title={notice} tone="success" /> : null}

      <PaneSection
        description={
          loading
            ? "正在读取同步状态…"
            : !status?.exists
              ? "数据源尚未登记"
              : status.configured
                ? `已配置 · ${status.reachable ? "可达" : "当前不可达"} · ${status.enabled ? "已启用" : "未启用"}`
                : "已登记但未配置地址"
        }
        title="数据源"
      >
        <PaneCard>
          <PaneRow
            control={
              <span className="cx-pane__input-group">
                <Input
                  aria-label="ScopeSentry 地址"
                  className="cx-pane__input cx-pane__input--w240"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://scopesentry.example.com"
                  size="sm"
                  value={url}
                />
              </span>
            }
            description="ScopeSentry 服务的接入地址"
            label="服务地址"
          />
          <PaneRow
            control={<SettingsSecretInput label="API Key" onChange={setApiKey} value={apiKey} />}
            description="留空 = 不改动已保存的 Key（服务端不回显）"
            label="API Key"
          />
          <PaneRow
            control={
              <Button
                color="primary"
                disabled={busy || url.trim().length === 0}
                onClick={() => void save()}
                size="sm"
                variant="solid"
              >
                {busy ? "保存中…" : "保存数据源"}
              </Button>
            }
            description="写入 /sync/scopesentry/datasource；保存后会重新拉一次状态"
            label="保存"
          />
          <PaneRow
            control={
              <PaneValueText
                mono
                title={(status?.tools ?? []).join(", ") || "—"}
                value={status?.tools?.length ? `${String(status.tools.length)} 个工具` : "—"}
              />
            }
            description="数据源声明可同步的资产类型（由服务端返回）"
            label="可用工具"
          />
        </PaneCard>
      </PaneSection>

      <PaneSection description="选择项目 / 任务与资产类型、查看同步结果" title="执行同步">
        <PaneCard>
          <PaneEmpty
            action={
              <Button color="primary" onClick={() => navigate("/function/sync")} size="sm" variant="solid">
                打开同步页
              </Button>
            }
            description="同步要挑目标并看逐类结果，属于操作动作；页面里还保留原始控制台。"
            title="在同步页里执行"
          />
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
