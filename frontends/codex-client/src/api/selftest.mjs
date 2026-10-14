#!/usr/bin/env node
/**
 * ARTEX · 自定义 API 客户端自测（真机跑，不是 mock）
 * =================================================
 * 做什么：
 *   1. 用 node:http 起一个**假的 OpenAI 兼容服务**（SSE / 一次性 JSON / 各种错误码都有）；
 *   2. 用 Node 22 自带的 module.stripTypeScriptTypes 把 src/api/*.ts **源码本身**
 *      转成 ESM 拷进临时目录再 import —— 测的是正在被产品使用的那份代码，
 *      不是另写一份 JS 复刻（复刻测试等于没测）；
 *   3. 跑 15 组断言，把结果打成 JSON 输出。
 *
 * 为什么值得单独写：
 *   SSE 解析 + 增量拼接是最容易「看起来能跑、一遇到网络分块就坏」的地方。
 *   所以这里既有「服务端把响应切成一字节一字节写」的真实分块测试，
 *   也有「把整段字节流在**每一个**偏移量上切成两半」的穷举测试。
 *
 * 用法：
 *   node src/api/selftest.mjs            # stdout = JSON，stderr = 人读清单
 * 退出码：0 = 全绿；1 = 有失败；2 = 脚本自身跑不起来（源码读不到 / 临时目录建不了）
 *
 * 确定性：分块用固定种子的伪随机（mulberry32），输出可复现，不含时间戳与随机数。
 * 注意：本文件刻意只用双引号字符串 + 加号拼接，不用模板字符串 —— 它同时被
 *       Node 直接执行、被项目 lint，保持最朴素的形式最不容易出岔子。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes("--verbose");

/** 需要加载的源码模块（相对 src/api，扁平，互相之间只有 ./ 相对导入） */
const MODULES = ["types", "errors", "url", "sse", "stream", "config", "client"];

// ─────────────────────────── 加载被测源码 ───────────────────────────

/**
 * 把 TS 源码转成可 import 的 ESM：
 *   · stripTypeScriptTypes(mode:"strip") 只删类型，不动语法（本目录没有 enum/namespace）；
 *   · "./x" 重写成 "./x.mjs" —— Node 的 ESM 解析要求显式扩展名，
 *     而工程 tsconfig 开了 allowImportingTsExtensions:false，源码里不能写 .ts 后缀。
 */
function buildSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "codex-api-selftest-"));
  for (const name of MODULES) {
    const source = readFileSync(join(HERE, `${name}.ts`), "utf8");
    const js = stripTypeScriptTypes(source, { mode: "strip", sourceUrl: `${name}.ts` });
    const rewritten = js.replace(/from\s+"(\.\/[^"]+)"/g, (_match, spec) => `from "${spec}.mjs"`);
    writeFileSync(join(dir, `${name}.mjs`), rewritten, "utf8");
  }
  return dir;
}

const sandbox = buildSandbox();
const load = (name) => import(pathToFileURL(join(sandbox, `${name}.mjs`)).href);

const { createApiClient } = await load("client");
const { createSseDecoder } = await load("sse");
const { createChatStreamAssembler, assembleChatCompletion } = await load("stream");
const { resolveEndpoints } = await load("url");
const { normalizeApiConfig, validateApiConfig } = await load("config");
const { ApiError, isApiError } = await load("errors");

// ─────────────────────────── 断言小工具 ───────────────────────────

const results = [];
let currentDetail = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function detail(text) {
  currentDetail = text;
}

async function test(name, fn) {
  currentDetail = "";
  const started = Date.now();
  try {
    const extra = await fn();
    results.push({ name: name, pass: true, ms: Date.now() - started, detail: extra || currentDetail });
  } catch (error) {
    results.push({
      name: name,
      pass: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 固定种子伪随机，保证「切碎」方式可复现 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────── 假服务端 ───────────────────────────

const REASONING_TEXT = "先看需求，再给结论。";
const CONTENT_PART_1 = "结论：流式拼接正确。";
const CONTENT_PART_2 = "\n\n1. 行缓冲\n2. 按 index 拼参数\n";
const FULL_CONTENT = CONTENT_PART_1 + CONTENT_PART_2;
const TOOL_ARGS_1 = '{"city":"San Francisco","unit":"celsius"}';
const TOOL_ARGS_2 = '{"path":"src/api/sse.ts"}';

function frame(delta, finishReason) {
  return {
    id: "chatcmpl-selftest",
    object: "chat.completion.chunk",
    created: 1700000000,
    model: "fake-model",
    choices: [{ index: 0, delta: delta, finish_reason: finishReason || null }],
  };
}

/** 正常流：reasoning → content（分两段）→ usage → finish → [DONE] */
function normalFrames() {
  return [
    frame({ role: "assistant", content: "" }),
    frame({ reasoning_content: REASONING_TEXT }),
    frame({ content: CONTENT_PART_1 }),
    frame({ content: CONTENT_PART_2 }),
    {
      id: "chatcmpl-selftest",
      object: "chat.completion.chunk",
      created: 1700000000,
      model: "fake-model",
      choices: [],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 22,
        total_tokens: 33,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    },
    frame({}, "stop"),
  ];
}

/** 工具调用流：两个调用，参数按 index 交错着来（真实服务端就是这么发的） */
function toolFrames() {
  const half = Math.floor(TOOL_ARGS_1.length / 2);
  const third = Math.floor(TOOL_ARGS_2.length / 3);
  return [
    frame({
      tool_calls: [
        { index: 0, id: "call_a", type: "function", function: { name: "get_weather", arguments: "" } },
      ],
    }),
    frame({
      tool_calls: [
        { index: 1, id: "call_b", type: "function", function: { name: "read_file", arguments: "" } },
      ],
    }),
    frame({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS_1.slice(0, half) } }] }),
    frame({ tool_calls: [{ index: 1, function: { arguments: TOOL_ARGS_2.slice(0, third) } }] }),
    frame({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS_1.slice(half) } }] }),
    frame({ tool_calls: [{ index: 1, function: { arguments: TOOL_ARGS_2.slice(third) } }] }),
    frame({}, "tool_calls"),
  ];
}

/** 用指定行结束符把 payload 拼成 SSE 文本（三种结束符混用，专门折腾解析器） */
function toSseText(payloads, terminators, doneTerminator) {
  let text = "";
  for (let index = 0; index < payloads.length; index += 1) {
    text += `data: ${JSON.stringify(payloads[index])}${terminators[index % terminators.length]}`;
  }
  return `${text}data: [DONE]${doneTerminator || "\n\n"}`;
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function errorBody(message, type, code) {
  return { error: { message: message, type: type || "invalid_request_error", code: code || null } };
}

const server = createServer(async (req, res) => {
  res.on("error", () => {});
  req.on("error", () => {});
  if (req.socket) req.socket.setNoDelay(true);

  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/v1/models") {
    writeJson(res, 200, {
      object: "list",
      data: [
        { id: "fake-b", object: "model", created: 2, owned_by: "vendor-b" },
        { id: "fake-a", object: "model", created: 1, owned_by: "vendor-a" },
      ],
    });
    return;
  }

  if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("no such endpoint");
    return;
  }

  let raw = "";
  for await (const part of req) raw += part;
  let body = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    body = {};
  }
  const model = typeof body.model === "string" ? body.model : "";
  const streamRequested = body.stream !== false;

  if (model === "e401") {
    writeJson(
      res,
      401,
      errorBody("Incorrect API key provided: sk-te***", "invalid_request_error", "invalid_api_key"),
    );
    return;
  }
  if (model === "e404") {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body><h1>404 Not Found</h1><p>the model nope does not exist</p></body></html>");
    return;
  }
  if (model === "e429") {
    const text = JSON.stringify(
      errorBody("Rate limit reached for requests", "rate_limit_error", "rate_limit_exceeded"),
    );
    res.writeHead(429, {
      "content-type": "application/json; charset=utf-8",
      "retry-after": "2",
      "content-length": Buffer.byteLength(text),
    });
    res.end(text);
    return;
  }
  if (model === "e500") {
    writeJson(
      res,
      500,
      errorBody("upstream connect error or disconnect/reset before headers", "server_error"),
    );
    return;
  }

  // 一次性 JSON（服务端忽略 stream:true）
  if (model === "json") {
    writeJson(res, 200, {
      id: "chatcmpl-json",
      object: "chat.completion",
      model: "fake-json-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "一次性 JSON 的正文",
            reasoning_content: "一次性 JSON 的思考",
            tool_calls: [
              { id: "call_json", type: "function", function: { name: "echo", arguments: '{"ok":true}' } },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  // 慢速流：先给两段正文，然后一直挂着（用于测「中途停止」）
  if (model === "slow") {
    res.write(`data: ${JSON.stringify(frame({ content: "第一段。" }))}\n\n`);
    await sleep(40);
    res.write(`data: ${JSON.stringify(frame({ content: "第二段。" }))}\n\n`);
    await sleep(5000);
    res.end();
    return;
  }

  // 首包就挂住（用于测连接超时）
  if (model === "hang") {
    await sleep(5000);
    res.end();
    return;
  }

  // 首包之后挂住（用于测流式空闲超时）
  if (model === "stall") {
    res.write(`data: ${JSON.stringify(frame({ content: "开了个头" }))}\n\n`);
    await sleep(5000);
    res.end();
    return;
  }

  // 200 里塞 error 对象
  if (model === "sse-error") {
    res.write(
      "data: " +
        JSON.stringify({ error: { message: "Rate limit reached for requests", type: "rate_limit_error" } }) +
        "\n\n",
    );
    res.end();
    return;
  }

  // 不是合法 JSON 的 data 行
  if (model === "bad-json") {
    res.write("data: {oops not json\n\n");
    res.end("data: [DONE]\n\n");
    return;
  }

  // 最后一条事件没有空行收尾
  if (model === "no-trailer") {
    res.write(`data: ${JSON.stringify(frame({ content: "没有收尾空行" }))}\n`);
    res.end();
    return;
  }

  // 切碎流：整段响应按 1~5 字节随机切开写，三种行结束符混用
  if (model === "chopped") {
    const text = toSseText(normalFrames(), ["\r\n\r\n", "\r\r", "\n\n"]);
    const random = mulberry32(20261009);
    let offset = 0;
    let writes = 0;
    while (offset < text.length) {
      const size = 1 + Math.floor(random() * 5);
      res.write(text.slice(offset, offset + size));
      offset += size;
      writes += 1;
      if (writes % 3 === 0) await sleep(0);
    }
    res.end();
    detail(`服务端把 ${Buffer.byteLength(text)} 字节切成了 ${writes} 次 write`);
    return;
  }

  // 默认：正常流（再故意切成 3 段写，模拟最常见的网络分块）
  const payloads = model === "tools" ? toolFrames() : normalFrames();
  const text = toSseText(payloads, ["\n\n"]);
  if (streamRequested) {
    const cut1 = Math.floor(text.length / 3);
    const cut2 = Math.floor((text.length * 2) / 3);
    res.write(text.slice(0, cut1));
    await sleep(2);
    res.write(text.slice(cut1, cut2));
    await sleep(2);
    res.end(text.slice(cut2));
  } else {
    res.end(text);
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

const client = createApiClient({
  baseUrl: BASE,
  apiKey: "sk-test-key",
  model: "ok",
  timeoutMs: 3000,
  idleTimeoutMs: 3000,
  stream: true,
});

function collect() {
  const events = [];
  return { events: events, onEvent: (event) => events.push(event) };
}

// ─────────────────────────── 1. 正常流式 ───────────────────────────

await test("sse/正常流式：正文与推理分离、finish_reason 与 usage 到位", async () => {
  const bag = collect();
  const result = await client.streamChat({
    messages: [{ role: "user", content: "你好" }],
    onEvent: bag.onEvent,
  });

  eq(result.content, FULL_CONTENT, "正文拼接");
  eq(result.reasoning, REASONING_TEXT, "推理段独立累积");
  eq(result.finishReason, "stop", "finish_reason");
  eq(result.usage?.totalTokens, 33, "usage.total_tokens");
  eq(result.usage?.reasoningTokens, 5, "usage.reasoning_tokens");
  assert(result.content.indexOf(REASONING_TEXT) === -1, "推理内容不能混进正文");
  assert(
    bag.events.some((event) => event.type === "done"),
    "应收到 done 事件",
  );
  assert(
    bag.events.some((event) => event.type === "usage"),
    "应收到 usage 事件",
  );
  return (
    "正文 " +
    result.content.length +
    " 字符 / 推理 " +
    result.reasoning.length +
    " 字符 / 事件 " +
    bag.events.length +
    " 个"
  );
});

// ─────────────────────────── 2. 切碎流式 ───────────────────────────

await test("sse/分块切断：服务端 1~5 字节切片 + CRLF/CR/LF 混用仍解析正确", async () => {
  const bag = collect();
  const result = await client.streamChat({
    model: "chopped",
    messages: [{ role: "user", content: "切碎" }],
    onEvent: bag.onEvent,
  });

  eq(result.content, FULL_CONTENT, "切碎后的正文拼接");
  eq(result.reasoning, REASONING_TEXT, "切碎后的推理拼接");
  eq(result.finishReason, "stop", "切碎后的 finish_reason");
  eq(result.usage?.totalTokens, 33, "切碎后的 usage");
  assert(
    bag.events.some((event) => event.type === "done"),
    "[DONE] 应被识别",
  );
  return currentDetail;
});

// ─────────────────────────── 3. 穷举切分点 ───────────────────────────

await test("sse/穷举切分点：整段字节流在任意偏移切成两半都等价", async () => {
  const text = toSseText(normalFrames(), ["\n\n"]);

  const run = (chunks) => {
    const decoder = createSseDecoder();
    const assembler = createChatStreamAssembler();
    const feed = (chunk) => {
      for (const event of decoder.push(chunk)) {
        assembler.push(event.data);
      }
    };
    for (const chunk of chunks) feed(chunk);
    for (const event of decoder.flush()) assembler.push(event.data);
    assembler.finish();
    return assembler.result();
  };

  for (let cut = 0; cut <= text.length; cut += 1) {
    const result = run([text.slice(0, cut), text.slice(cut)]);
    if (result.content !== FULL_CONTENT) {
      throw new Error(`在偏移 ${cut} 处切开后正文不一致：${JSON.stringify(result.content)}`);
    }
  }

  const perChar = run(text.split(""));
  eq(perChar.content, FULL_CONTENT, "一字一节流的正文");
  eq(perChar.reasoning, REASONING_TEXT, "一字一节流的推理");
  eq(perChar.usage?.totalTokens, 33, "一字一节流的 usage");

  return `${text.length} 个二分偏移点 + 一字一节（${text.length} 次 push）全部一致`;
});

// ─────────────────────────── 4. 工具调用增量 ───────────────────────────

await test("sse/tool_calls：按 index 拼接 arguments，交错顺序不乱", async () => {
  const bag = collect();
  const result = await client.streamChat({
    model: "tools",
    messages: [{ role: "user", content: "tool" }],
    onEvent: bag.onEvent,
  });

  eq(result.toolCalls.length, 2, "工具调用数量");
  eq(result.toolCalls[0].id, "call_a", "第一个调用 id");
  eq(result.toolCalls[0].name, "get_weather", "第一个调用 name");
  eq(result.toolCalls[0].arguments, TOOL_ARGS_1, "第一个调用 arguments 拼接");
  eq(result.toolCalls[1].id, "call_b", "第二个调用 id");
  eq(result.toolCalls[1].name, "read_file", "第二个调用 name");
  eq(result.toolCalls[1].arguments, TOOL_ARGS_2, "第二个调用 arguments 拼接");
  eq(result.finishReason, "tool_calls", "finish_reason");
  const argDeltas = bag.events.filter((event) => event.type === "tool_delta" && event.argumentsDelta);
  assert(argDeltas.length >= 4, `应有多段 arguments 增量，实际 ${argDeltas.length}`);
  const done = bag.events.filter((event) => event.type === "tool_done");
  eq(done.length, 2, "两个 tool_done 事件");
  return `2 个调用 / ${argDeltas.length} 段参数增量，拼接后与原文逐字节相等`;
});

// ─────────────────────────── 5. 中途停止 ───────────────────────────

await test("abort/中途停止：立即结束、分类为 aborted、保留已收到的正文", async () => {
  const controller = new AbortController();
  const bag = collect();
  const started = Date.now();
  const pending = client.streamChat({
    model: "slow",
    messages: [{ role: "user", content: "慢" }],
    signal: controller.signal,
    onEvent: bag.onEvent,
  });
  setTimeout(() => controller.abort(), 120);

  let caught = null;
  try {
    await pending;
  } catch (error) {
    caught = error;
  }
  const elapsed = Date.now() - started;

  assert(caught !== null, "中断后必须 reject，不能静默 resolve");
  assert(isApiError(caught), `中断错误应是 ApiError，实际 ${caught?.name}`);
  eq(caught.kind, "aborted", "错误分类");
  assert(elapsed < 1000, `应在 1 秒内结束，实际 ${elapsed}ms`);
  const streamed = bag.events
    .filter((event) => event.type === "content")
    .map((event) => event.delta)
    .join("");
  assert(streamed.length > 0, "中断前应已经收到部分正文");
  return `${elapsed}ms 内结束，中断前已收到 ${JSON.stringify(streamed)}`;
});

// ─────────────────────────── 6. 两种超时 ───────────────────────────

await test("timeout/连接超时与流式空闲超时是两种可读报错", async () => {
  const quick = createApiClient({
    baseUrl: BASE,
    apiKey: "k",
    model: "hang",
    timeoutMs: 300,
    idleTimeoutMs: 300,
  });
  const started = Date.now();
  let first = null;
  try {
    await quick.streamChat({ messages: [{ role: "user", content: "hang" }] });
  } catch (error) {
    first = error;
  }
  eq(first?.kind, "timeout", "首包超时分类");
  assert(/超时/.test(first.message), `超时文案应可读，实际「${first?.message}」`);
  assert(Date.now() - started < 2000, "超时必须自己触发，不能等服务端 5 秒");

  const stall = createApiClient({
    baseUrl: BASE,
    apiKey: "k",
    model: "stall",
    timeoutMs: 2000,
    idleTimeoutMs: 250,
  });
  let second = null;
  try {
    await stall.streamChat({ messages: [{ role: "user", content: "stall" }] });
  } catch (error) {
    second = error;
  }
  eq(second?.kind, "timeout", "流式空闲超时分类");
  assert(/没有收到新数据/.test(second.message), `空闲超时文案，实际「${second?.message}」`);
  return "首包超时 + 流式空闲超时都归到 timeout";
});

// ─────────────────────────── 7. 非 2xx ───────────────────────────

await test("error/非 2xx：401/404/429/500 分类正确、文案中文、服务端原话保留", async () => {
  const cases = [
    { model: "e401", kind: "auth", status: 401, must: ["认证失败", "401"] },
    { model: "e404", kind: "not_found", status: 404, must: ["接口不存在", "404", "does not exist"] },
    { model: "e429", kind: "rate_limit", status: 429, must: ["请求过于频繁", "429", "Rate limit reached"] },
    { model: "e500", kind: "server", status: 500, must: ["服务端错误", "500"] },
  ];
  const seen = [];
  for (const item of cases) {
    let caught = null;
    try {
      await client.streamChat({ model: item.model, messages: [{ role: "user", content: "x" }] });
    } catch (error) {
      caught = error;
    }
    assert(caught !== null, `${item.model} 必须抛错`);
    eq(caught.kind, item.kind, `${item.model} 分类`);
    eq(caught.status, item.status, `${item.model} 状态码`);
    // 401（auth）是「改了密钥才有用」，故意不给重试按钮；其余错误都应该可重试
    eq(caught.retryable, item.kind !== "auth", `${item.model} retryable 期望值`);
    for (const fragment of item.must) {
      const haystack = `${caught.message} ${caught.detail}`;
      assert(
        haystack.indexOf(fragment) !== -1,
        item.model +
          " 文案里应包含「" +
          fragment +
          "」，实际「" +
          caught.message +
          " / " +
          caught.detail +
          "」",
      );
    }
    seen.push(`${item.status}=${caught.kind}`);
  }

  let limited = null;
  try {
    await client.streamChat({ model: "e429", messages: [{ role: "user", content: "x" }] });
  } catch (error) {
    limited = error;
  }
  eq(limited.retryAfterMs, 2000, "Retry-After: 2 → 2000ms");
  return `${seen.join(" / ")} / 429 解析 retry-after=2s`;
});

// ─────────────────────────── 8. 流内错误 / 坏 JSON ───────────────────────────

await test("error/流内错误：200 里的 error 对象与非法 JSON 都能识别", async () => {
  let inner = null;
  try {
    await client.streamChat({ model: "sse-error", messages: [{ role: "user", content: "x" }] });
  } catch (error) {
    inner = error;
  }
  eq(inner?.kind, "rate_limit", "流内 error 分类");
  assert(
    inner.message.indexOf("Rate limit reached") !== -1,
    `流内错误应带服务端原话，实际「${inner?.message}」`,
  );

  let broken = null;
  try {
    await client.streamChat({ model: "bad-json", messages: [{ role: "user", content: "x" }] });
  } catch (error) {
    broken = error;
  }
  eq(broken?.kind, "protocol", "非法 JSON 分类");
  assert(/解析失败/.test(broken.message), `非法 JSON 文案，实际「${broken?.message}」`);
  return "流内 error → rate_limit；坏 JSON → protocol";
});

// ─────────────────────────── 9. 一次性 JSON 降级 ───────────────────────────

await test("degrade/服务端忽略 stream:true 时自动走一次性 JSON，并补发同样的事件", async () => {
  const bag = collect();
  const result = await client.streamChat({
    model: "json",
    messages: [{ role: "user", content: "x" }],
    onEvent: bag.onEvent,
  });
  eq(result.content, "一次性 JSON 的正文", "正文");
  eq(result.reasoning, "一次性 JSON 的思考", "推理");
  eq(result.toolCalls.length, 1, "工具调用");
  eq(result.toolCalls[0].name, "echo", "工具名");
  eq(result.usage?.totalTokens, 7, "usage");
  assert(
    bag.events.some((event) => event.type === "content"),
    "降级后仍应吐 content 事件",
  );
  assert(
    bag.events.some((event) => event.type === "done"),
    "降级后仍应吐 done 事件",
  );
  return `正文/推理/工具调用/usage 都齐，事件 ${bag.events.length} 个`;
});

// ─────────────────────────── 10. 缺收尾空行 ───────────────────────────

await test("sse/收尾：最后一条事件没有空行也要吐出来", async () => {
  const result = await client.streamChat({ model: "no-trailer", messages: [{ role: "user", content: "x" }] });
  eq(result.content, "没有收尾空行", "正文");
  return "flush() 兜住了缺空行的服务端";
});

// ─────────────────────────── 11. 模型列表 ───────────────────────────

await test("models/列表：解析 + 排序；失败时不抛异常而是降级", async () => {
  const ok = await client.listModels();
  eq(ok.ok, true, "ok");
  eq(ok.models.length, 2, "数量");
  eq(ok.models[0].id, "fake-a", "按 id 排序");
  eq(ok.models[0].ownedBy, "vendor-a", "owned_by");
  assert(ok.latencyMs >= 0, "latencyMs");

  const degraded = await createApiClient({ baseUrl: `${BASE}/nomodels`, model: "x" }).listModels();
  eq(degraded.ok, false, "降级 ok=false");
  eq(degraded.models.length, 0, "降级空列表");
  eq(degraded.error?.kind, "not_found", "降级错误分类");
  assert(degraded.error.message.length > 0, "降级也要有文案");

  const unreachable = await createApiClient({
    baseUrl: "http://127.0.0.1:1",
    model: "x",
    timeoutMs: 800,
  }).listModels();
  eq(unreachable.ok, false, "连不上时 ok=false");
  assert(
    ["network", "timeout"].indexOf(unreachable.error?.kind) !== -1,
    `连不上应分类为 network/timeout，实际 ${unreachable.error?.kind}`,
  );
  return `成功 2 条（含排序）/ 404 降级 / 连不上降级（${unreachable.error?.kind}）`;
});

// ─────────────────────────── 12. URL 推导 ───────────────────────────

await test("url/Base URL 推导：常见写法 + 非法值报 config 错", async () => {
  const cases = [
    ["https://api.deepseek.com", "https://api.deepseek.com/v1/chat/completions"],
    ["https://api.deepseek.com/v1", "https://api.deepseek.com/v1/chat/completions"],
    ["http://127.0.0.1:11434/v1/", "http://127.0.0.1:11434/v1/chat/completions"],
    ["http://127.0.0.1:8000/v2", "http://127.0.0.1:8000/v2/chat/completions"],
    ["http://host/v1/chat/completions", "http://host/v1/chat/completions"],
  ];
  for (const pair of cases) {
    eq(resolveEndpoints(pair[0]).chatUrl, pair[1], `chatUrl(${pair[0]})`);
  }
  eq(
    resolveEndpoints("http://host/v1/chat/completions").modelsUrl,
    "http://host/v1/models",
    "由 chat 端点反推 models",
  );
  eq(
    resolveEndpoints("https://api.deepseek.com/v1").modelsUrl,
    "https://api.deepseek.com/v1/models",
    "modelsUrl",
  );

  for (const bad of ["", "   ", "api.deepseek.com", "ftp://x"]) {
    let caught = null;
    try {
      resolveEndpoints(bad);
    } catch (error) {
      caught = error;
    }
    assert(caught !== null, `「${bad}」应被判为配置错误`);
    eq(caught.kind, "config", `「${bad}」错误分类`);
    assert(isApiError(caught), "应是 ApiError");
  }
  return "5 种地址推导 + 4 种非法值";
});

// ─────────────────────────── 13. 配置规范化 ───────────────────────────

await test("config/规范化：超时钳制、headers 清洗、缺字段校验", async () => {
  const normalized = normalizeApiConfig({
    baseUrl: "  https://x.example/v1  ",
    model: "  m1 ",
    headers: { "  x-api-key ": "abc", "": "ignored", "X-Empty": null },
    timeoutMs: 10,
    idleTimeoutMs: 10000000,
    temperature: 9,
    maxTokens: -5,
    stream: false,
  });
  eq(normalized.baseUrl, "https://x.example/v1", "baseUrl 去空白");
  eq(normalized.model, "m1", "model 去空白");
  eq(normalized.timeoutMs, 1000, "timeoutMs 下钳制");
  eq(normalized.idleTimeoutMs, 600000, "idleTimeoutMs 上钳制");
  eq(normalized.temperature, 2, "temperature 上钳制");
  eq(normalized.maxTokens, 1, "maxTokens 下钳制");
  eq(normalized.stream, false, "stream");
  eq(Object.keys(normalized.headers).length, 1, "headers 清洗（空 key / null 丢掉）");
  eq(normalized.headers["x-api-key"], "abc", "headers key 去空白");

  const fallback = normalizeApiConfig(null);
  eq(fallback.baseUrl, "", "空配置 baseUrl 为空 → 不偷偷指向任何服务");
  const issues = validateApiConfig(fallback);
  assert(
    issues.some((issue) => issue.field === "baseUrl" && issue.level === "error"),
    "缺 baseUrl 应报 error",
  );
  assert(
    issues.some((issue) => issue.field === "model" && issue.level === "error"),
    "缺 model 应报 error",
  );
  return "钳制/清洗/校验都符合预期";
});

// ─────────────────────────── 14. 请求体与请求头 ───────────────────────────

await test("request/请求体：system 前置、工具消息透传、自定义头可覆盖 Authorization", async () => {
  const captured = [];
  const probe = createServer((req, res) => {
    let raw = "";
    req.on("data", (part) => {
      raw += part;
    });
    req.on("end", () => {
      captured.push({ headers: req.headers, body: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    });
  });
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const probePort = probe.address().port;
  try {
    const probeClient = createApiClient({
      baseUrl: `http://127.0.0.1:${probePort}`,
      apiKey: "sk-original",
      model: "m",
      systemPrompt: "你是助手",
      userProfile: "我是安全工程师",
      reasoningEffort: "low",
      temperature: 0.3,
      maxTokens: 128,
      headers: { Authorization: "Bearer sk-overridden", "x-api-key": "custom" },
    });
    const result = await probeClient.completeChat({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "yo",
          toolCalls: [{ index: 0, id: "call_1", name: "f", arguments: "{}" }],
        },
        { role: "tool", content: "result", toolCallId: "call_1" },
      ],
    });
    eq(result.content, "ok", "正文");

    assert(captured.length === 1, `探针服务端应收到 1 次请求，实际 ${captured.length}`);
    const sent = captured[0];
    assert(sent.body?.messages, `请求体里应有 messages，实际 ${JSON.stringify(sent.body)}`);
    eq(sent.body.model, "m", "model");
    eq(sent.body.stream, false, "stream=false");
    eq(sent.body.messages[0].role, "system", "system 前置");
    // 2026-10-15「配置 / 个性化 → 自定义 API」合并：system = 提示词 + 关于你（顺序固定）
    eq(sent.body.messages[0].content, "你是助手\n\n我是安全工程师", "system 内容（提示词 + 关于你）");
    eq(sent.body.messages[1].content, "hi", "用户消息");
    // 扁平形态（{index,id,name,arguments}）→ 线上形态（{id,type,function:{name,arguments}}）
    const wireCall = sent.body.messages[2].tool_calls?.[0];
    eq(wireCall.function.name, "f", "assistant tool_calls 的 function.name");
    eq(wireCall.function.arguments, "{}", "assistant tool_calls 的 function.arguments");
    eq(wireCall.type, "function", "assistant tool_calls 的 type");
    eq(wireCall.id, "call_1", "assistant tool_calls 的 id");
    eq(sent.body.messages[3].tool_call_id, "call_1", "tool 消息的 tool_call_id");
    eq(sent.body.temperature, 0.3, "temperature");
    eq(sent.body.max_tokens, 128, "max_tokens");
    eq(sent.body.reasoning_effort, "low", "reasoning_effort（推理强度）透传");
    eq(sent.body.stream_options, undefined, "默认不发 stream_options（兼容性优先）");
    eq(sent.headers.authorization, "Bearer sk-overridden", "自定义头覆盖 Authorization");
    eq(sent.headers["x-api-key"], "custom", "自定义头透传");
    eq(sent.headers.accept, "application/json", "非流式 Accept");
    // 反向用例：两个新字段留空时**一个都不能出现在请求体里**（兼容不认识的网关）
    const bare = createApiClient({
      baseUrl: `http://127.0.0.1:${probePort}`,
      apiKey: "",
      model: "m",
      systemPrompt: "",
      userProfile: "",
      reasoningEffort: "",
    });
    await bare.completeChat({ messages: [{ role: "user", content: "hi" }] });
    const bareBody = captured[captured.length - 1].body;
    eq(bareBody.reasoning_effort, undefined, "留空时不发 reasoning_effort");
    eq(bareBody.messages[0].role, "user", "没有提示词时不发空的 system 消息");

    return "system（提示词 + 关于你）/ reasoning_effort / 工具消息 / 自定义头全部按预期送达";
  } finally {
    probe.close();
    if (probe.closeAllConnections) probe.closeAllConnections();
  }
});

// ─────────────────────────── 15. 一次性响应解析 ───────────────────────────

await test("stream/一次性响应解析：message 形态的 reasoning 与 tool_calls", async () => {
  const result = assembleChatCompletion({
    model: "m",
    choices: [
      {
        message: {
          content: [{ type: "text", text: "数组形态的正文" }],
          reasoning: "另一种推理字段名",
          tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: '{"a":1}' } }],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { input_tokens: 5, output_tokens: 6 },
  });
  eq(result.content, "数组形态的正文", "数组形态 content");
  eq(result.reasoning, "另一种推理字段名", "reasoning 兼容字段");
  eq(result.toolCalls[0].arguments, '{"a":1}', "工具参数");
  eq(result.usage?.promptTokens, 5, "input_tokens 兼容");
  eq(result.usage?.completionTokens, 6, "output_tokens 兼容");
  eq(result.finishReason, "tool_calls", "finish_reason");

  let thrown = null;
  try {
    assembleChatCompletion({ error: { message: "boom" } });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof ApiError, "错误体应抛 ApiError");
  return "字段兼容 + 错误体处理";
});

// ─────────────────────────── 收尾 ───────────────────────────

server.close();
if (server.closeAllConnections) server.closeAllConnections();
rmSync(sandbox, { recursive: true, force: true });

const failed = results.filter((result) => !result.pass);
const report = {
  ok: failed.length === 0,
  suite: "src/api",
  passed: results.length - failed.length,
  failed: failed.length,
  total: results.length,
  results: results.map((result) =>
    VERBOSE ? result : { name: result.name, pass: result.pass, detail: result.detail },
  ),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

process.stderr.write("\n=== src/api selftest ===\n");
for (const result of results) {
  process.stderr.write(`${(result.pass ? "PASS  " : "FAIL  ") + result.name}\n        ${result.detail}\n`);
}
process.stderr.write(`${report.passed}/${report.total} 通过\n\n`);

process.exitCode = report.ok ? 0 : 1;
