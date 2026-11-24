import { useCallback, useEffect, useRef, useState } from "react";
import { artexApi } from "@/artex";
import type { Asset, AssetType, Finding, TrafficExchange } from "@/artex/types";
import { CodeBlock } from "@/chat/CodeBlock";
import {
  CodexAlertTriangle,
  CodexArrowLeft,
  CodexChevronRight,
  CodexGlobe,
  CodexRefresh,
  CodexX,
} from "@/icons";
import { Button, Spinner } from "@/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { EmptyState, SlatePage } from "./parts";

import "./operations-pages.css";

const _ASSET_PAGE_SIZE = 40;
const _FINDING_PAGE_SIZE = 20;

function formatTime(value?: string | number) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function _assetLabel(asset: Asset) {
  return asset.domain || asset.ip || asset.url || `资产 #${asset.id}`;
}

function _assetMeta(asset: Asset) {
  const port = asset.port ? `端口 ${asset.port}` : "";
  const code = asset.status_code ? `HTTP ${asset.status_code}` : "";
  return [code, port, asset.service_type || asset.service_name].filter(Boolean).join(" · ") || "—";
}

function _statusClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function _severityLabel(value: Finding["severity"]) {
  return value === "critical" ? "严重" : value === "high" ? "高" : value === "medium" ? "中" : "低";
}

function loadError(caught: unknown) {
  return caught instanceof Error ? caught.message : "无法加载 Focus 数据";
}

function redactSensitiveText(value?: string) {
  if (!value) return "";
  return value
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[已隐藏]")
    .replace(
      /(\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|token|password|passwd|secret|credential|authorization)\b["']?\s*[=:]\s*["']?)[^\s&,"'}]+/gi,
      "$1[已隐藏]",
    );
}

function _redactApprovalInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(_redactApprovalInput);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /api[-_ ]?key|token|password|passwd|secret|credential|authorization/i.test(key)
          ? "[已隐藏]"
          : _redactApprovalInput(item),
      ]),
    );
  }
  return typeof value === "string" ? redactSensitiveText(value) : value;
}

function _typeLabel(type: AssetType) {
  return {
    root_domain: "根域名",
    subdomain: "子域名",
    ip: "IP 地址",
    service: "服务",
    app: "应用",
    endpoint: "端点",
  }[type];
}

export function TrafficPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [host, setHost] = useState("");
  const [method, setMethod] = useState("all");
  const [items, setItems] = useState<TrafficExchange[]>([]);
  const [hosts, setHosts] = useState<Array<{ host: string; count: number }>>([]);
  const [selectedId, setSelectedId] = useState<string | null | undefined>();
  const [detail, setDetail] = useState<{ id: string; req: string; resp: string } | null>(null);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const detailRequestSeq = useRef(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, nextHosts] = await Promise.all([
        artexApi.traffic(page, pageSize, host, method, query),
        artexApi.trafficHosts(),
      ]);
      setItems(result.items);
      setTotal(result.total);
      setCount(result.count);
      setHosts(nextHosts);
    } catch (caught) {
      setError(loadError(caught));
    } finally {
      setLoading(false);
    }
  }, [host, method, page, query]);
  useEffect(() => {
    void load();
  }, [load]);

  const activeId = selectedId === undefined ? items[0]?.id : selectedId;

  const loadExchange = useCallback(async (id: string) => {
    const seq = ++detailRequestSeq.current;
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    try {
      const exchange = await artexApi.trafficExchange(id);
      if (seq === detailRequestSeq.current) setDetail({ id, ...exchange });
    } catch (caught) {
      if (seq === detailRequestSeq.current) setDetailError(loadError(caught));
    } finally {
      if (seq === detailRequestSeq.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) void loadExchange(activeId);
    else {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
    }
    return () => {
      detailRequestSeq.current++;
    };
  }, [activeId, loadExchange]);

  return (
    <SlatePage
      actions={
        <>
          <Select
            onValueChange={(next) => {
              setHost(next === "all" ? "" : next);
              setPage(0);
              setSelectedId(undefined);
            }}
            value={host || "all"}
          >
            <SelectTrigger aria-label="按主机筛选流量">
              <SelectValue placeholder="全部主机" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部主机</SelectItem>
              {hosts.map((item) => (
                <SelectItem key={item.host} value={item.host}>
                  {item.host} · {item.count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(next) => {
              setMethod(next);
              setPage(0);
              setSelectedId(undefined);
            }}
            value={method}
          >
            <SelectTrigger aria-label="按 HTTP 方法筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "全部方法" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            aria-label="刷新流量"
            className="cx-slate-iconbutton"
            onClick={() => void load()}
            type="button"
          >
            <CodexRefresh size={16} />
          </button>
        </>
      }
      fill
      search={{
        id: "traffic-search",
        value: query,
        placeholder: "搜索 URL、主机或内容",
        onChange: (next) => {
          setQuery(next);
          setPage(0);
          setSelectedId(undefined);
        },
      }}
      subtitle="MITM 代理捕获的真实 HTTP 交换；请求与响应按需读取。"
      title="HTTP 流量"
    >
      <div className="cx-split ops-master-detail ops-traffic">
        <section aria-label="HTTP 流量列表" className="cx-split__main">
          <header className="ops-list-header">
            <h1>HTTP 流量</h1>
            <span>
              {total.toLocaleString()} 匹配 · {count.toLocaleString()} 已捕获
            </span>
          </header>
          {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
          {!error && loading ? <OpsLoading /> : null}
          {!error && !loading && items.length === 0 ? (
            <EmptyState description="更改筛选条件，或等待代理捕获流量。" icon={CodexGlobe} title="暂无流量" />
          ) : null}
          {!error && !loading && items.length > 0 ? (
            <>
              <div className="ops-master-list">
                <ul className="cx-page__list">
                  {items.map((exchange) => {
                    const responseClass = Math.floor((exchange.status ?? 0) / 100);
                    return (
                      <li className="cx-row-wrap" key={exchange.id}>
                        <button
                          aria-pressed={exchange.id === activeId}
                          className="cx-row ops-traffic-row"
                          data-selected={exchange.id === activeId ? "true" : undefined}
                          onClick={() => setSelectedId(exchange.id)}
                          type="button"
                        >
                          <span aria-hidden className="ops-method-label">
                            {exchange.method || "—"}
                          </span>
                          <span className="cx-row__main">
                            <span className="cx-row__title" title={redactSensitiveText(exchange.url)}>
                              {redactSensitiveText(exchange.host || exchange.url) || "未知主机"}
                            </span>
                            <span className="cx-row__subtitle" title={redactSensitiveText(exchange.url)}>
                              {redactSensitiveText(exchange.url) || "—"}
                            </span>
                          </span>
                          <span className={`ops-response-code ops-response-code--${responseClass}`}>
                            {exchange.status || "—"}
                          </span>
                          <span className="cx-row__meta">{formatTime(exchange.ts)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <Pagination
                page={page + 1}
                pageSize={pageSize}
                total={total}
                onPageChange={(next) => {
                  setPage(next - 1);
                  setSelectedId(undefined);
                }}
              />
            </>
          ) : null}
        </section>
        <aside aria-label="HTTP 交换详情" className="cx-split__detail ops-page__detail ops-traffic-detail">
          {activeId ? (
            <>
              <header className="cx-detail__header">
                <span className="cx-detail__title">HTTP 交换详情</span>
                <Button
                  aria-label="关闭流量详情"
                  onClick={() => setSelectedId(null)}
                  size="2xs"
                  uniform
                  variant="ghost"
                >
                  <CodexX size={14} />
                </Button>
              </header>
              <div className="cx-detail__scroll">
                {detailError ? (
                  <OpsError message={detailError} onRetry={() => activeId && void loadExchange(activeId)} />
                ) : null}
                {detailLoading ? <OpsLoading /> : null}
                {detail && !detailError ? (
                  <>
                    <div className="ops-detail-heading">
                      <span aria-hidden className="ops-method-label">
                        {items.find((item) => item.id === detail.id)?.method || "HTTP"}
                      </span>
                      <div>
                        <h2>{items.find((item) => item.id === detail.id)?.host || "请求"}</h2>
                        <p>
                          {redactSensitiveText(items.find((item) => item.id === detail.id)?.url || detail.id)}
                        </p>
                      </div>
                    </div>
                    <div className="ops-traffic-meta">
                      <DetailField
                        label="状态"
                        value={String(items.find((item) => item.id === detail.id)?.status || "—")}
                      />
                      <DetailField
                        label="捕获时间"
                        value={formatTime(items.find((item) => item.id === detail.id)?.ts)}
                      />
                      <DetailField
                        label="内容类型"
                        value={items.find((item) => item.id === detail.id)?.content_type}
                      />
                      <DetailField
                        label="响应大小"
                        value={`${(items.find((item) => item.id === detail.id)?.resp_len ?? 0).toLocaleString()} B`}
                      />
                    </div>
                    <section className="ops-detail-section">
                      <h3>请求</h3>
                      <CodeBlock
                        className="ops-traffic-code"
                        code={redactSensitiveText(detail.req) || "（空请求）"}
                        language="http"
                      />
                    </section>
                    <section className="ops-detail-section">
                      <h3>响应</h3>
                      <CodeBlock
                        className="ops-traffic-code"
                        code={redactSensitiveText(detail.resp) || "（空响应）"}
                        language="http"
                      />
                    </section>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="ops-detail-empty">选择一条请求以检查 HTTP 报文</div>
          )}
        </aside>
      </div>
    </SlatePage>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="ops-pagination">
      <span>
        第 {page} / {pageCount} 页
      </span>
      <div>
        <Button
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          uniform
          variant="ghost"
        >
          <CodexArrowLeft size={14} />
        </Button>
        <Button
          aria-label="下一页"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          uniform
          variant="ghost"
        >
          <CodexChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="ops-detail-field">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function _OpsStat({ label, tone, value }: { label: string; tone?: string; value: number | string }) {
  return (
    <div className={`ops-stat${tone ? ` ops-stat--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OpsLoading() {
  return (
    <div className="ops-loading">
      <Spinner size="md" />
      <span>正在加载 Focus 数据</span>
    </div>
  );
}

function OpsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ops-error" role="alert">
      <CodexAlertTriangle size={17} />
      <span>{message}</span>
      <Button onClick={onRetry} size="sm" variant="ghost">
        重试
      </Button>
    </div>
  );
}
