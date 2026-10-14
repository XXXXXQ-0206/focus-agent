import type { Finding, FindingRetest, TrafficExchange } from "./types";

export interface TrafficPage {
  items: TrafficExchange[];
  total: number;
  count: number;
  page: number;
  size: number;
  enabled?: boolean;
  proxy?: string;
}

export function findingDetailPath(id: string): string {
  return `/exploration/findings/${encodeURIComponent(id)}`;
}

export function findingLineagePath(id: string): string {
  return `${findingDetailPath(id)}/lineage`;
}

export function findingTrafficPath(id: string): string {
  return `${findingDetailPath(id)}/traffic`;
}

export function findingTrafficDetailPath(id: string, bindingId: string): string {
  return `${findingTrafficPath(id)}/${encodeURIComponent(bindingId)}`;
}

export function findingRetestsPath(id: string): string {
  return `${findingDetailPath(id)}/retests`;
}

export function startFindingRetestPath(id: string): string {
  return findingRetestsPath(id);
}

export function trafficPath({ page = 0, size = 50, host = "", method = "", query = "" } = {}): string {
  const params = new URLSearchParams({ page: String(Math.max(0, page)), size: String(Math.max(1, size)) });
  if (host.trim()) params.set("host", host.trim());
  if (method && method !== "all") params.set("method", method);
  if (query.trim()) params.set("q", query.trim());
  return `/traffic?${params.toString()}`;
}

export function trafficExchangePath(id: string): string {
  return `/traffic/exchange?id=${encodeURIComponent(id)}`;
}

export function normalizeTrafficPage(input: {
  exchanges?: unknown;
  total?: unknown;
  count?: unknown;
  page?: unknown;
  size?: unknown;
  enabled?: unknown;
  proxy?: unknown;
}): TrafficPage {
  const items = Array.isArray(input.exchanges) ? input.exchanges.filter(isTrafficExchange) : [];
  return {
    items,
    total: numberOr(input.total, numberOr(input.count, items.length)),
    count: numberOr(input.count, items.length),
    page: numberOr(input.page, 0),
    size: numberOr(input.size, 50),
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    proxy: typeof input.proxy === "string" ? input.proxy : undefined,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isTrafficExchange(value: unknown): value is TrafficExchange {
  return Boolean(value && typeof value === "object" && typeof (value as TrafficExchange).id === "string");
}

export function findingId(finding: Finding): string {
  return finding.finding_id || finding.id;
}

export function retestIsActive(retest: FindingRetest): boolean {
  return retest.status === "pending" || retest.status === "running";
}
