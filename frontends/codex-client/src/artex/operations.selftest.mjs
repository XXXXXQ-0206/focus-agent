#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourceDir = new URL("./", import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), "artex-operations-selftest-"));
try {
  for (const name of ["operations", "types", "api", "auth", "sse", "stream-origin"]) {
    const source = readFileSync(new URL(`${name}.ts`, sourceDir), "utf8");
    const js = ts
      .transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replaceAll('from "./types"', 'from "./types.mjs"')
      .replaceAll('from "./auth"', 'from "./auth.mjs"')
      .replaceAll('from "./sse"', 'from "./sse.mjs"')
      .replaceAll('from "./stream-origin"', 'from "./stream-origin.mjs"')
      .replaceAll('from "./operations"', 'from "./operations.mjs"');
    writeFileSync(join(tmp, `${name}.mjs`), js, "utf8");
  }

  const operations = await import(pathToFileURL(join(tmp, "operations.mjs")));
  assert.equal(operations.findingDetailPath("a/b"), "/exploration/findings/a%2Fb");
  assert.equal(operations.findingLineagePath("9"), "/exploration/findings/9/lineage");
  assert.equal(operations.findingTrafficPath("9"), "/exploration/findings/9/traffic");
  assert.equal(operations.findingTrafficDetailPath("9", "a/b"), "/exploration/findings/9/traffic/a%2Fb");
  assert.equal(operations.findingRetestsPath("9"), "/exploration/findings/9/retests");
  assert.equal(
    operations.trafficPath({
      page: 2,
      size: 25,
      host: "api.example.com",
      method: "GET",
      query: "token & id",
    }),
    "/traffic?page=2&size=25&host=api.example.com&method=GET&q=token+%26+id",
  );
  assert.equal(operations.trafficPath({ page: -1, size: 0, method: "all" }), "/traffic?page=0&size=1");
  assert.equal(operations.trafficExchangePath("x/y"), "/traffic/exchange?id=x%2Fy");
  const normalized = operations.normalizeTrafficPage({
    exchanges: [{ id: "x", host: "h" }, { nope: true }],
    total: 7,
    count: 9,
    page: 2,
    size: 5,
  });
  assert.deepEqual(
    normalized.items.map((item) => item.id),
    ["x"],
  );
  assert.deepEqual(
    { total: normalized.total, count: normalized.count, page: normalized.page, size: normalized.size },
    { total: 7, count: 9, page: 2, size: 5 },
  );
  assert.equal(operations.retestIsActive({ status: "running" }), true);
  assert.equal(operations.retestIsActive({ status: "completed" }), false);

  const requests = [];
  globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined });
    const path = new URL(url, "http://localhost").pathname;
    const payload =
      path === "/api/traffic"
        ? { exchanges: [], total: 13, count: 30, page: 2, size: 25, enabled: true }
        : path === "/api/traffic/exchange"
          ? { req: "GET /", resp: "200 OK" }
          : path === "/api/traffic/hosts"
            ? { hosts: [{ host: "api.example.com", count: 3 }] }
            : path.endsWith("/lineage")
              ? { nodes: [], edges: [] }
              : path.endsWith("/retests") && init.method === "POST"
                ? { retest: { id: 3, status: "pending" }, created: true }
                : path.endsWith("/retests")
                  ? { retests: [{ id: 2, status: "completed" }] }
                  : path.endsWith("/traffic/17")
                    ? {
                        binding: { id: "17" },
                        request: { content: "GET /" },
                        response: { content: "200 OK" },
                      }
                    : path.endsWith("/traffic")
                      ? {
                          finding_id: "7",
                          bindings: [{ id: "17", role: "proof", snapshot: { url: "https://example.com" } }],
                        }
                      : { finding_id: "7", id: "node-7", report: "details" };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const { artexApi } = await import(pathToFileURL(join(tmp, "api.mjs")));
  assert.equal(typeof artexApi.findingDetail, "function");
  assert.equal(typeof artexApi.findingLineage, "function");
  assert.equal(typeof artexApi.findingTraffic, "function");
  assert.equal(typeof artexApi.findingTrafficDetail, "function");
  assert.equal(typeof artexApi.findingRetests, "function");
  assert.equal(typeof artexApi.startFindingRetest, "function");
  assert.equal(typeof artexApi.trafficExchange, "function");
  assert.equal(typeof artexApi.trafficHosts, "function");
  await artexApi.findingDetail("7");
  await artexApi.findingLineage("7");
  assert.equal((await artexApi.findingTraffic("7")).bindings.length, 1);
  assert.equal((await artexApi.findingTrafficDetail("7", "17")).request.content, "GET /");
  assert.equal((await artexApi.findingRetests("7")).length, 1);
  assert.equal((await artexApi.startFindingRetest("7", "verify again")).created, true);
  const page = await artexApi.traffic(2, 25, "api.example.com", "GET", "token & id");
  assert.deepEqual(
    { total: page.total, count: page.count, page: page.page, size: page.size },
    { total: 13, count: 30, page: 2, size: 25 },
  );
  await artexApi.trafficExchange("x/y");
  assert.equal((await artexApi.trafficHosts())[0].host, "api.example.com");
  assert.deepEqual(
    requests.map(({ url, method }) => [url, method]),
    [
      ["/api/exploration/findings/7", "GET"],
      ["/api/exploration/findings/7/lineage", "GET"],
      ["/api/exploration/findings/7/traffic", "GET"],
      ["/api/exploration/findings/7/traffic/17", "GET"],
      ["/api/exploration/findings/7/retests", "GET"],
      ["/api/exploration/findings/7/retests", "POST"],
      ["/api/traffic?page=2&size=25&host=api.example.com&method=GET&q=token+%26+id", "GET"],
      ["/api/traffic/exchange?id=x%2Fy", "GET"],
      ["/api/traffic/hosts", "GET"],
    ],
  );
  assert.deepEqual(requests.find(({ method }) => method === "POST")?.body, { notes: "verify again" });
  console.log(JSON.stringify({ ok: true, suite: "artex-operations", pureAssertions: 12, apiAssertions: 22 }));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
