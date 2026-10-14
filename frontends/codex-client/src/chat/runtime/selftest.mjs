#!/usr/bin/env node
/**
 * ARTEX · 会话运行时自测（真机跑：真 HTTP + 真 SSE + 真状态机）
 * ============================================================
 * 做什么：
 *   1. 用 node:http 起一个假的 OpenAI 兼容服务（普通流 / 工具流 / 慢流 / 401）；
 *   2. 用 module.stripTypeScriptTypes 把 src/api/*.ts 与 src/chat/runtime/*.ts
 *      **源码本身** 转成 ESM 拷进临时目录 import —— 测的是产品代码，不是复刻；
 *   3. 覆盖三层：
 *      · reducer  纯状态机（增量、工具合并、错误兜底、中断）
 *      · store    localStorage 持久化（落盘/读回/清洗）
 *      · runtime  端到端（发消息 → 流式 → 工具回环 → done / aborted / error / 重新生成）
 *
 * 用法：node src/chat/runtime/selftest.mjs        # stdout = JSON，stderr = 人读清单
 * 退出码：0 全绿 / 1 有失败 / 2 环境起不来
 *
 * 确定性：不依赖随机数与时间戳做断言；服务器按请求序号生成内容，断言只看相对变化。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** 要加载的源码：api 层原样拷贝，runtime 层加 rt- 前缀避免同名 types.ts 撞车 */
const API_MODULES = ["types", "errors", "url", "sse", "stream", "config", "client"];
const RT_MODULES = ["types", "reducer", "store", "runtime"];

// ────────── 假 localStorage（在 import 之前装好） ──────────

function createFakeStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] || null,
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => {
      map.set(String(key), String(value));
    },
    removeItem: (key) => {
      map.delete(String(key));
    },
    clear: () => map.clear(),
  };
}

const fakeStorage = createFakeStorage();
globalThis.window = { localStorage: fakeStorage };

// ────────── 加载被测源码 ──────────

function buildSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "codex-runtime-selftest-"));

  /** 顺序很重要：先 strip 掉类型（import type 会整条消失），再重写剩下的运行时导入 */
  const compile = (outputName, rawSource, layer) => {
    const js = stripTypeScriptTypes(rawSource, { mode: "strip", sourceUrl: `${outputName}.ts` });
    let rewritten = js;
    if (layer === "api") {
      rewritten = js.replace(/from\s+"(\.\/[^".]+)"/g, 'from "./$1.mjs"');
    } else {
      rewritten = js
        .replace(/from\s+"@\/api\/([^"]+)"/g, 'from "./$1.mjs"')
        .replace(/from\s+"\.\/([^".]+)"/g, 'from "./rt-$1.mjs"');
    }
    // strip 之后不该再有 @/ 导入（剩下的只可能是注释里提到的路径）
    if (/from\s+"@\//.test(rewritten)) {
      throw new Error(`运行时源码里有没被重写掉的 @/ 导入（应全部是 import type）：${outputName}`);
    }
    writeFileSync(join(dir, `${outputName}.mjs`), rewritten, "utf8");
  };

  for (const name of API_MODULES) {
    compile(name, readFileSync(join(SRC, "api", `${name}.ts`), "utf8"), "api");
  }
  for (const name of RT_MODULES) {
    compile(`rt-${name}`, readFileSync(join(SRC, "chat", "runtime", `${name}.ts`), "utf8"), "runtime");
  }
  // 领域模型 → 官方块的适配层（block-adapter.ts）。它的两处 import 都是 `import type`
  // （strip 之后整条消失），所以能独立编译成 ESM —— 这里跑它的意义是：
  // 「runtime 事件 → 官方块」这条映射接错了自测就红，不用等肉眼看 UI 才发现。
  compile("block-adapter", readFileSync(join(SRC, "chat", "block-adapter.ts"), "utf8"), "runtime");
  return dir;
}

const sandbox = buildSandbox();
const load = (name) => import(pathToFileURL(join(sandbox, `${name}.mjs`)).href);

const { runtimeReducer, createIdleState } = await load("rt-reducer");
const store = await load("rt-store");
const rtTypes = await load("rt-types");
const { createConversationRuntime, getConversationRuntime } = await load("rt-runtime");
const { createApiClient } = await load("client");
const { messageToBlocks } = await load("block-adapter");

// ────────── 断言工具 ──────────

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
function _detail(text) {
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

// ────────── 假服务端 ──────────

const REASONING = "先想一步。";
const TOOL_ARGS = '{"city":"San Francisco"}';
const FINAL_TEXT = "工具结果已收到。";
/** tools-multi 用的两条调用：bash → exec 块，read_file → file-edit 块（SPEC §4 / §6） */
const BASH_ARGS = '{"command":"ls -la"}';
const READ_ARGS = '{"path":"src/index.ts"}';
const MULTI_TEXT = "两条都跑完了。";
let requestCounter = 0;
const capturedBodies = [];

function chunk(delta, finishReason) {
  return {
    id: "chatcmpl-rt",
    object: "chat.completion.chunk",
    created: 1700000000,
    model: "fake",
    choices: [{ index: 0, delta: delta, finish_reason: finishReason || null }],
  };
}
function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
function usageFrame() {
  return sse({
    id: "chatcmpl-rt",
    object: "chat.completion.chunk",
    model: "fake",
    choices: [],
    usage: { prompt_tokens: 7, completion_tokens: 8, total_tokens: 15 },
  });
}

const server = createServer(async (req, res) => {
  res.on("error", () => {});
  req.on("error", () => {});
  if (req.socket) req.socket.setNoDelay(true);

  if (req.method !== "POST") {
    res.writeHead(404).end("nope");
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
  capturedBodies.push(body);
  requestCounter += 1;
  const model = body.model;

  if (model === "error401") {
    const text = JSON.stringify({
      error: { message: "Incorrect API key provided", type: "invalid_request_error" },
    });
    res.writeHead(401, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
    res.end(text);
    return;
  }

  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });

  if (model === "slow") {
    res.write(sse(chunk({ content: "第一段。" })));
    await sleep(30);
    res.write(sse(chunk({ content: "第二段。" })));
    await sleep(5000);
    res.end();
    return;
  }

  // 慢速 + 推理：用于断言「中断后推理块不再显示思考中」
  if (model === "slow-reasoning") {
    res.write(sse(chunk({ reasoning_content: "先想一半。" })));
    await sleep(30);
    res.write(sse(chunk({ content: "正文一半。" })));
    await sleep(5000);
    res.end();
    return;
  }

  // 一次给两条调用（同时覆盖 exec 与 file-edit 两类块 + 参数拼接 + 工具回环轮数）
  if (model === "tools-multi") {
    const hasToolResult =
      Array.isArray(body.messages) && body.messages.some((message) => message.role === "tool");
    if (!hasToolResult) {
      res.write(
        sse(
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_bash",
                type: "function",
                function: { name: "bash", arguments: BASH_ARGS },
              },
              {
                index: 1,
                id: "call_read",
                type: "function",
                function: { name: "read_file", arguments: READ_ARGS },
              },
            ],
          }),
        ),
      );
      res.write(sse(chunk({}, "tool_calls")));
      res.end("data: [DONE]\n\n");
      return;
    }
    res.write(sse(chunk({ content: MULTI_TEXT })));
    res.write(sse(chunk({}, "stop")));
    res.end("data: [DONE]\n\n");
    return;
  }

  if (model === "tools") {
    const hasToolResult =
      Array.isArray(body.messages) && body.messages.some((message) => message.role === "tool");
    if (!hasToolResult) {
      const half = Math.floor(TOOL_ARGS.length / 2);
      res.write(
        sse(
          chunk({
            tool_calls: [
              { index: 0, id: "call_w", type: "function", function: { name: "get_weather", arguments: "" } },
            ],
          }),
        ),
      );
      await sleep(5);
      res.write(
        sse(chunk({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS.slice(0, half) } }] })),
      );
      await sleep(5);
      res.write(sse(chunk({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS.slice(half) } }] })));
      res.write(sse(chunk({}, "tool_calls")));
      res.end("data: [DONE]\n\n");
      return;
    }
    res.write(sse(chunk({ content: FINAL_TEXT })));
    res.write(sse(chunk({}, "stop")));
    res.end("data: [DONE]\n\n");
    return;
  }

  // 默认：推理 + 正文（正文带请求序号，便于断言「重新生成确实换了内容」）
  const text = `回答 #${requestCounter}`;
  res.write(sse(chunk({ role: "assistant", content: "" })));
  res.write(sse(chunk({ reasoning_content: REASONING })));
  const cut = Math.floor(text.length / 2);
  res.write(sse(chunk({ content: text.slice(0, cut) })));
  await sleep(3);
  res.write(sse(chunk({ content: text.slice(cut) })));
  res.write(usageFrame());
  res.write(sse(chunk({}, "stop")));
  res.end("data: [DONE]\n\n");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

function configFor(model) {
  return {
    baseUrl: BASE,
    apiKey: "sk-rt",
    model: model,
    timeoutMs: 4000,
    idleTimeoutMs: 4000,
    stream: true,
  };
}

function assistantOf(state) {
  return state.messages.filter((message) => message.role === "assistant");
}

// ═══════════════ 1. reducer：纯状态机 ═══════════════

await test("reducer/轮次生命周期：sending → streaming → done，正文与推理分轨累积", async () => {
  const user = {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "hi",
    createdAt: "2026-01-01T00:00:00Z",
  };
  const assistant = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "",
    createdAt: "2026-01-01T00:00:00Z",
    streaming: true,
  };
  let state = createIdleState("c1");
  const seen = [];
  state = runtimeReducer(state, { type: "turn/start", user: user, assistant: assistant, at: 1 });
  seen.push(state.phase);
  eq(state.messages.length, 2, "turn/start 后消息数");
  eq(state.activeMessageId, "a1", "activeMessageId");

  state = runtimeReducer(state, { type: "phase", phase: "streaming", activeMessageId: "a1" });
  seen.push(state.phase);
  state = runtimeReducer(state, { type: "delta", id: "a1", content: "你" });
  state = runtimeReducer(state, { type: "delta", id: "a1", content: "好" });
  state = runtimeReducer(state, { type: "delta", id: "a1", reasoning: "想" });
  state = runtimeReducer(state, { type: "delta", id: "a1", reasoning: "一下" });
  eq(state.messages[1].content, "你好", "正文增量拼接");
  eq(state.messages[1].reasoning, "想一下", "推理增量独立拼接");

  state = runtimeReducer(state, {
    type: "turn/finish",
    id: "a1",
    phase: "done",
    finishReason: "stop",
    usage: null,
    at: 2,
  });
  seen.push(state.phase);
  eq(state.messages[1].streaming, false, "结束后 streaming=false");
  eq(state.messages[1].finishReason, "stop", "finishReason");
  eq(state.activeMessageId, null, "activeMessageId 清空");
  return `阶段序列 ${seen.join(" → ")}`;
});

await test("reducer/工具调用：同一 id 的增量合并成一条（不是 push 两条）", async () => {
  const assistant = {
    id: "a2",
    conversationId: "c2",
    role: "assistant",
    content: "",
    createdAt: "x",
    streaming: true,
  };
  let state = createIdleState("c2");
  state = runtimeReducer(state, {
    type: "turn/start",
    user: { id: "u2", conversationId: "c2", role: "user", content: "tool", createdAt: "x" },
    assistant: assistant,
    at: 1,
  });
  state = runtimeReducer(state, {
    type: "tool/upsert",
    id: "a2",
    call: { id: "call_1", name: "get_weather", summary: "接收中", status: "running", input: '{"city"' },
  });
  state = runtimeReducer(state, {
    type: "tool/upsert",
    id: "a2",
    call: {
      id: "call_1",
      name: "get_weather",
      summary: "San Francisco",
      status: "pending",
      input: '{"city":"SF"}',
    },
  });
  state = runtimeReducer(state, {
    type: "tool/upsert",
    id: "a2",
    call: { id: "call_2", name: "read_file", summary: "a.ts", status: "success", input: "{}", output: "ok" },
  });
  eq(state.messages[1].toolCalls.length, 2, "工具调用条数");
  eq(state.messages[1].toolCalls[0].input, '{"city":"SF"}', "第一条被覆盖更新");
  eq(state.messages[1].toolCalls[0].status, "pending", "status 更新");
  eq(state.messages[1].toolCalls[1].output, "ok", "第二条 output");
  return "2 条调用：同 id 合并、不同 id 追加";
});

await test("reducer/错误与中断：错误只写 error 字段（不再回填正文）；中断不写 error", async () => {
  const make = () => {
    const assistant = {
      id: "a3",
      conversationId: "c3",
      role: "assistant",
      content: "",
      createdAt: "x",
      streaming: true,
    };
    return runtimeReducer(createIdleState("c3"), {
      type: "turn/start",
      user: { id: "u3", conversationId: "c3", role: "user", content: "q", createdAt: "x" },
      assistant: assistant,
      at: 1,
    });
  };

  const failed = runtimeReducer(make(), {
    type: "turn/error",
    id: "a3",
    error: {
      kind: "auth",
      message: "认证失败（401）：API Key 无效或缺失。",
      status: 401,
      detail: "bad key",
      retryable: false,
    },
  });
  eq(failed.phase, "error", "错误阶段");
  eq(failed.error.kind, "auth", "error.kind");
  // 改动说明：错误文案不再回填正文（错误条改由 Message.tsx 用官方 ErrorBlock 渲染，
  // 见 runtime/types.ts 的 toDisplayErrorNode），所以这里断言「错误只从 error 字段出」。
  eq(failed.messages[1].content, "", "错误不再回填正文（否则 UI 会渲染两遍同样的字）");
  eq(failed.messages[1].error.kind, "auth", "错误写到消息上（UI 就认这个字段）");
  eq(failed.messages[1].streaming, false, "出错后 streaming=false");

  const stopped = runtimeReducer(make(), {
    type: "turn/error",
    id: "a3",
    error: { kind: "aborted", message: "已停止生成。", status: null, detail: "", retryable: false },
  });
  eq(stopped.phase, "aborted", "中断阶段");
  eq(stopped.error, null, "中断不写 error（不该弹红字）");
  eq(stopped.messages[1].content, "", "中断不回填文案");
  eq(stopped.messages[1].aborted, true, "标记 aborted");
  return "error 回填 / aborted 不弹错，两条路都分离";
});

await test("reducer/历史裁剪：truncate 之后旧消息不再参与请求", async () => {
  const { truncateFrom, findPreviousUserMessage } = await load("rt-reducer");
  const messages = [
    { id: "u1", conversationId: "c", role: "user", content: "第一问", createdAt: "x" },
    { id: "a1", conversationId: "c", role: "assistant", content: "第一答", createdAt: "x" },
    { id: "u2", conversationId: "c", role: "user", content: "第二问", createdAt: "x" },
    { id: "a2", conversationId: "c", role: "assistant", content: "第二答", createdAt: "x" },
  ];
  const kept = truncateFrom(messages, "a2");
  eq(kept.length, 3, "裁掉 a2 之后剩 3 条");
  eq(kept[2].id, "u2", "最后一条是用户消息");
  const owner = findPreviousUserMessage(messages, "a2");
  eq(owner.id, "u2", "重新生成要用的用户消息");
  return "truncateFrom / findPreviousUserMessage 正确";
});

// ═══════════════ 2. store：本地持久化 ═══════════════

await test("store/持久化：写入 → 读回 → 清洗瞬时字段；会话索引按更新时间倒序", async () => {
  const record = store.createConversationRecord({
    id: "conv-store",
    title: "这是一条很长很长很长很长很长很长很长很长很长很长的标题",
  });
  store.upsertConversation({ ...record, messageCount: 1 });
  store.writeMessages("conv-store", [
    {
      id: "m1",
      conversationId: "conv-store",
      role: "assistant",
      content: "内容",
      createdAt: "2026-01-01T00:00:00Z",
      streaming: true,
      phase: "streaming",
      reasoning: "思考",
    },
  ]);

  const back = store.readMessages("conv-store");
  eq(back.length, 1, "读回条数");
  eq(back[0].content, "内容", "正文");
  eq(back[0].reasoning, "思考", "推理也落盘");
  eq(back[0].streaming, undefined, "streaming 不落盘");
  eq(back[0].phase, undefined, "phase 不落盘");

  const list = store.listConversations();
  eq(list.length, 1, "索引里有 1 个会话");
  eq(list[0].id, "conv-store", "会话 id");
  assert(list[0].title.length <= 41, `标题要截断，实际 ${list[0].title.length}`);
  eq(store.deriveTitle("  多   空格\n换行  "), "多 空格 换行", "标题压平空白");
  eq(store.deriveTitle("   "), "新聊天", "空标题兜底");

  store.removeConversation("conv-store");
  eq(store.readMessages("conv-store").length, 0, "删除会话后消息也没了");
  return "落盘/读回/清洗/删除 + 标题派生";
});

// ═══════════════ 3. runtime：端到端 ═══════════════

await test("runtime/端到端：真 HTTP + 真 SSE → 消息、阶段、持久化全部到位", async () => {
  const runtime = createConversationRuntime("conv-e2e", { config: configFor("ok"), persist: true });
  const phases = [];
  runtime.subscribe(() => phases.push(runtime.getState().phase));

  await runtime.sendAsync("你好");
  const state = runtime.getState();

  eq(state.messages.length, 2, "消息数");
  eq(state.messages[0].role, "user", "第一条是用户");
  eq(state.messages[0].content, "你好", "用户内容");
  eq(state.messages[1].role, "assistant", "第二条是助手");
  assert(
    /^回答 #\d+$/.test(state.messages[1].content),
    `助手正文应来自服务端，实际 ${JSON.stringify(state.messages[1].content)}`,
  );
  eq(state.messages[1].reasoning, REASONING, "推理段");
  eq(state.messages[1].streaming, false, "结束后不再 streaming");
  eq(state.messages[1].usage?.totalTokens, 15, "usage 落到消息上");
  eq(state.phase, "done", "最终阶段");

  assert(phases.indexOf("sending") !== -1, "应经过 sending");
  assert(phases.indexOf("streaming") !== -1, "应经过 streaming");
  assert(phases[phases.length - 1] === "done", "最后停在 done");

  const persisted = store.readMessages("conv-e2e");
  eq(persisted.length, 2, "持久化条数");
  eq(persisted[1].content, state.messages[1].content, "持久化内容一致");
  const index = store.listConversations().find((item) => item.id === "conv-e2e");
  assert(index !== undefined, "会话索引里应有它");
  eq(index.title, "你好", "标题取首条用户消息");
  return `消息 ${state.messages.length} 条 / 阶段 ${phases.join(",")}`;
});

await test("runtime/工具回环：arguments 拼接完整 → 执行 → 结果回灌 → 第二轮收尾", async () => {
  const executed = [];
  const runtime = createConversationRuntime("conv-tools", {
    config: configFor("tools"),
    persist: false,
    toolExecutor: async (request) => {
      executed.push(request);
      return "天气：晴";
    },
  });
  const before = capturedBodies.length;
  await runtime.sendAsync("旧金山天气");

  eq(executed.length, 1, "工具执行次数");
  eq(executed[0].name, "get_weather", "工具名");
  eq(executed[0].arguments, TOOL_ARGS, "执行器收到的 arguments 必须是完整拼好的 JSON");

  const state = runtime.getState();
  const assistants = assistantOf(state);
  eq(assistants.length, 2, "工具回环应产生两条助手消息");
  eq(assistants[0].toolCalls.length, 1, "第一条带工具调用");
  eq(assistants[0].toolCalls[0].status, "success", "执行状态");
  eq(assistants[0].toolCalls[0].output, "天气：晴", "工具输出");
  eq(assistants[0].toolCalls[0].input, TOOL_ARGS, "工具入参原文");
  eq(assistants[1].content, FINAL_TEXT, "第二轮正文");
  eq(state.phase, "done", "最终阶段");

  const second = capturedBodies[before + 1];
  const toolMessages = second.messages.filter((message) => message.role === "tool");
  eq(toolMessages.length, 1, "第二请求里应有 tool 消息（snake_case 线上的 tool_call_id）");
  eq(toolMessages[0].tool_call_id, "call_w", "tool_call_id");
  eq(toolMessages[0].content, "天气：晴", "tool 内容");
  const assistantWithCalls = second.messages.find(
    (message) => message.role === "assistant" && message.tool_calls,
  );
  assert(assistantWithCalls !== undefined, "第二请求里应有带 tool_calls 的 assistant 消息");
  eq(assistantWithCalls.tool_calls[0].function.arguments, TOOL_ARGS, "回灌的 arguments 完整");
  return "1 次工具执行 / 2 条助手消息 / 线上字段为 tool_calls + tool_call_id";
});

await test("runtime/中途停止：stop() 立即收尾为 aborted，保留已收到的正文", async () => {
  const runtime = createConversationRuntime("conv-abort", { config: configFor("slow"), persist: false });
  const pending = runtime.sendAsync("慢一点");
  await sleep(120);
  const started = Date.now();
  runtime.stop();
  await pending;
  const elapsed = Date.now() - started;

  const state = runtime.getState();
  eq(state.phase, "aborted", "阶段");
  eq(state.error, null, "中断不该记 error");
  eq(state.messages[1].aborted, true, "消息标记 aborted");
  eq(state.messages[1].streaming, false, "不再 streaming");
  assert(
    state.messages[1].content.length > 0,
    `已收到的正文要保留，实际 ${JSON.stringify(state.messages[1].content)}`,
  );
  assert(elapsed < 900, `stop() 应立刻返回，实际 ${elapsed}ms`);
  return `${elapsed}ms 收尾，保留正文 ${JSON.stringify(state.messages[1].content)}`;
});

await test("runtime/错误：401 → 阶段 error、可读文案、retryable=false", async () => {
  const runtime = createConversationRuntime("conv-401", { config: configFor("error401"), persist: false });
  await runtime.sendAsync("会失败");
  const state = runtime.getState();
  eq(state.phase, "error", "阶段");
  eq(state.error?.kind, "auth", "错误分类");
  eq(state.error?.retryable, false, "401 不该给重试按钮");
  eq(state.messages[1].content, "", "正文保持空（错误只走 message.error）");
  eq(state.messages[1].error?.kind, "auth", "消息上带 error");
  assert(
    state.messages[1].error.message.indexOf("认证失败") !== -1,
    "中文错误文案（@/api/errors 的分类结果）",
  );
  return "kind=auth / 文案在 message.error 上";
});

await test("runtime/重新生成：旧回复被替换、内容确实变了", async () => {
  const runtime = createConversationRuntime("conv-regen", { config: configFor("ok"), persist: false });
  await runtime.sendAsync("再答一次");
  const first = assistantOf(runtime.getState())[0];
  assert(first !== undefined, "第一次应有回复");

  await runtime.regenerateAsync();
  const state = runtime.getState();
  eq(state.messages.length, 2, "重新生成后仍是 2 条（旧的被替换，不是追加）");
  const second = assistantOf(state)[0];
  assert(second.id !== first.id, "应是新的助手消息");
  assert(second.content !== first.content, `内容应重新从服务端取：${first.content} → ${second.content}`);
  eq(state.phase, "done", "阶段回到 done");
  return `${first.content} → ${second.content}`;
});

await test("runtime/编辑重发：改过的用户消息进入请求，其后消息被丢弃", async () => {
  const runtime = createConversationRuntime("conv-edit", { config: configFor("ok"), persist: false });
  await runtime.sendAsync("原始问题");
  const userId = runtime.getState().messages[0].id;
  const before = capturedBodies.length;

  await runtime.editAndResendAsync(userId, "改过的问题");
  const state = runtime.getState();
  eq(state.messages.length, 2, "仍是一条问一条答");
  eq(state.messages[0].content, "改过的问题", "用户消息已更新");
  eq(state.messages[0].editedFrom, "原始问题", "保留原文便于撤销");
  const sent = capturedBodies[before];
  eq(sent.messages[sent.messages.length - 1].content, "改过的问题", "请求里带的是改后的文本");
  return "editAndResend 生效且只发一条用户消息";
});

await test("runtime/并发保护：生成中再点发送会被忽略；stop() 空转不报错", async () => {
  const runtime = createConversationRuntime("conv-busy", { config: configFor("slow"), persist: false });
  const first = runtime.sendAsync("第一条");
  await sleep(60);
  const stateDuring = runtime.getState();
  eq(stateDuring.phase, "streaming", "此时应在流式");
  await runtime.sendAsync("第二条");
  const during = runtime.getState();
  eq(during.messages.length, 2, "生成中发送应被忽略（消息数不变）");

  runtime.stop();
  await first;
  runtime.stop();
  eq(runtime.getState().phase, "aborted", "空转 stop() 不改变阶段");
  return "并发保护 + 幂等 stop 都成立";
});

await test("runtime/草稿会话：首次发送自动建会话并 rekey 注册表（侧栏据此导航）", async () => {
  let created = null;
  const draft = getConversationRuntime(undefined, {
    config: configFor("ok"),
    persist: true,
    onConversationCreated: (id) => {
      created = id;
    },
  });
  eq(draft.key, "__draft__", "初始是草稿 key");
  await draft.sendAsync("草稿里的第一句");

  assert(created !== null, "onConversationCreated 应被调用");
  eq(draft.key, created, "注册表 key 已换成真实会话 id");
  eq(draft.getState().conversationId, created, "state 里的会话 id");
  assert(getConversationRuntime(created) === draft, "用新 id 取到的必须是同一个实例（否则流会被打断）");
  assert(
    store.listConversations().some((item) => item.id === created),
    "侧栏索引里应出现该会话",
  );
  return `草稿 → ${created} 并保持单例`;
});

// ═══════════════ 4. 事件映射 → 官方块（SPEC-CONVERSATION-BLOCKS） ═══════════════
// 这一组把「runtime 事件 → block-adapter → 官方块词表」这条链跑通：
// 块类型、状态、默认展开态都是**可断言的数据**，不用等肉眼在 UI 里看。

await test("事件映射/推理+正文：流式期间块 status=running（折叠骨架据此自动展开），完成后 completed", async () => {
  const runtime = createConversationRuntime("conv-map-reasoning", {
    config: configFor("ok"),
    persist: false,
  });
  const statuses = [];
  const pairs = [];
  runtime.subscribe(() => {
    const last = assistantOf(runtime.getState()).pop();
    if (!last) return;
    const node = messageToBlocks(last).find((block) => block.kind === "reasoning");
    if (!node) return;
    statuses.push(node.status);
    pairs.push(`${last.streaming ? "S" : "-"}:${node.status}${last.reasoningComplete ? "+done" : ""}`);
  });

  await runtime.sendAsync("映射一下");
  const assistant = assistantOf(runtime.getState())[0];
  const blocks = messageToBlocks(assistant);
  const reasoning = blocks.find((block) => block.kind === "reasoning");

  eq(reasoning.content, REASONING, "推理正文 = 服务端 reasoning_content 增量");
  eq(reasoning.status, "completed", "完成后块状态");
  assert(statuses.indexOf("running") !== -1, `流式期间应出现过 running，实际 ${JSON.stringify(statuses)}`);
  eq(reasoning.elapsed, undefined, "runtime 不提供耗时 → 文案落在「已思考」而不是「思考了 X」");
  eq(blocks.length, 1, "这一轮只有推理块（正文由消息自己渲染）");
  // 段级收束：正文一旦开始流出，推理段就该结束（否则整轮都在「思考中 + 自动展开」）。
  // block-adapter 只认轮级的 message.streaming（这里仍是 running），Message.tsx 拿 reasoningComplete
  // 把块的 status 翻成 completed —— 所以这里断言的是**信号的源头**，UI 效果由真机采样证明。
  eq(assistant.reasoningComplete, true, "正文开始后 reasoningComplete 应为 true");
  assert(
    pairs.indexOf("S:running+done") !== -1,
    `整轮还在流式（S）时 reasoningComplete 就该已置上，实际序列 ${JSON.stringify(pairs)}`,
  );
  return "running → completed（默认折叠），耗时缺省";
});

await test("事件映射/工具调用：bash→exec 块、read_file→file-edit 块；exec 卡不再有 status 派生的自动展开（R4）", async () => {
  const seen = [];
  const runtime = createConversationRuntime("conv-map-tools", {
    config: configFor("tools-multi"),
    persist: false,
    toolExecutor: async (request) => {
      await sleep(20);
      return request.name === "bash" ? "total 0" : "export {};";
    },
  });
  runtime.subscribe(() => {
    const last = assistantOf(runtime.getState()).pop();
    if (!last) return;
    const nodes = messageToBlocks(last).filter(
      (block) => block.kind === "exec" || block.kind === "file-edit",
    );
    if (nodes.length === 0) return;
    seen.push(nodes.map((node) => `${node.kind}:${node.status}:${String(node.defaultExpanded)}`).join("|"));
  });

  await runtime.sendAsync("两条一起跑");
  const state = runtime.getState();
  const blocks = messageToBlocks(assistantOf(state)[0]);

  eq(blocks.length, 2, "两条调用 → 两个块");
  eq(blocks[0].kind, "exec", "bash → exec（SPEC §4）");
  // block-adapter 的 commandOf() 会从原始 arguments 里抽 command 字段（Lead 已修，见该文件注释）：
  // 直接把 JSON 糊在命令行位置是错的。这条断言同时锁住「原始参数仍在 call.input 上」。
  eq(assistantOf(state)[0].toolCalls[0].input, BASH_ARGS, "原始 arguments 留在 ToolCall.input 上");
  eq(blocks[0].command, "ls -la", "命令行取 arguments.command，而不是整段 JSON");
  eq(blocks[0].status, "completed", "执行完的状态");
  /**
   * ⚠️ 契约变更（**不是放宽断言**），依据 docs/RULINGS.md R4：
   * 旧期望是 `false` —— 那编码的是 adapter 自己按 status 派生的「期望展开态」，
   * 一条**我们自己发明的**、没有官方出处的行为（「流式自动展开」）。
   * 官方唯一渲染 data-testid="exec-shell-body" 的组件 (`Jx`) 根本没有这个输入：
   * `useState("collapsed")` + 只由用户点击改 ⇒ 适配层不再产出该字段（应为 undefined）。
   */
  eq(blocks[0].defaultExpanded, undefined, "R4：exec 卡不再有 defaultExpanded（官方 Jx 无此输入）");
  eq(blocks[1].kind, "file-edit", "read_file → file-edit（SPEC §6）");
  eq(blocks[1].files[0].path, "src/index.ts", "文件路径取 summary");
  eq(blocks[1].status, "completed", "执行完的状态");
  /**
   * ⚠️ 契约变更（**不是放宽断言**），依据 docs/RULINGS.md R4：
   * 旧断言要求「running 期间必须 defaultExpanded=true」—— 那编码的是**我们自己发明的**非官方行为。
   * 官方 exec 卡在流式中也**不自动展开**（`Jx` 的 useState("collapsed") 只由用户点击改，
   * 不经过 tool-activity-disclosure 状态机；「流式展开/完成折叠」官方只确证于推理块 `Aw`）。
   * 所以这里翻成**否定式**，并且额外钉住「running 这一段真的被采到过」——否则否定式会退化成空断言。
   * 展开态的真实收口在 blocks/ExecBlock.tsx（受控档：useState(false) + onToggle）。
   */
  assert(
    seen.some((row) => row.indexOf("exec:running") !== -1),
    `running 这一段必须真的被采到过（否则下面那条否定式没有约束力），实际 ${JSON.stringify(seen)}`,
  );
  assert(
    !seen.some((row) => row.indexOf(":true") !== -1),
    `R4：exec / file-edit 都不得再有 status 派生的自动展开（defaultExpanded 只能缺省），实际 ${JSON.stringify(seen)}`,
  );
  eq(state.round, 1, "工具回环轮数写进 state.round");
  return "exec + file-edit，无 status 派生展开，1 轮回环";
});

await test("事件映射/工具调用（线上配置：没有 toolExecutor）：调用停在 pending → 块 status=stopped，不转圈", async () => {
  const runtime = createConversationRuntime("conv-map-tools-noexec", {
    config: configFor("tools-multi"),
    persist: false,
  });
  await runtime.sendAsync("没有执行器");
  const state = runtime.getState();
  const assistant = assistantOf(state)[0];
  const calls = assistant.toolCalls;

  eq(calls.length, 2, "两条调用都记下来了");
  eq(calls[0].status, "pending", "没有执行器 → 停在 pending（这是 runtime 的契约）");
  const blocks = messageToBlocks(assistant);
  eq(blocks[0].status, "stopped", "pending → 官方 stopped（不是 running：running 会永远转圈 + 永远展开）");
  // 同 R4：旧期望 `false` 属于 adapter 的 status 派生通道（已被移除）；现在该字段**根本不存在**，
  // 展开态由 ExecBlock 的受控 useState(false) 持有 ⇒ 恒折叠、只由用户点击打开。
  eq(blocks[0].defaultExpanded, undefined, "R4：exec 卡无 defaultExpanded 通道（stopped 恒折叠）");
  eq(state.phase, "done", "整轮仍以 done 收尾");
  return "无执行器：pending → stopped，不占展开态";
});

await test("事件映射/中断（流中）：已收到的推理与正文都保留，推理块不再是「思考中」", async () => {
  const runtime = createConversationRuntime("conv-map-abort", {
    config: configFor("slow-reasoning"),
    persist: false,
  });
  const pending = runtime.sendAsync("慢一点");
  await sleep(150);
  runtime.stop();
  await pending;

  const assistant = assistantOf(runtime.getState())[0];
  eq(assistant.reasoning, "先想一半。", "已收到的推理保留");
  eq(assistant.content, "正文一半。", "已收到的正文保留");
  eq(assistant.aborted, true, "标记 aborted");
  const block = messageToBlocks(assistant).find((node) => node.kind === "reasoning");
  eq(block.status, "completed", "中断后推理块不再显示「思考中」（否则会一直转圈）");
  eq(assistant.error, null, "中断不是错误 → 不产错误块");
  return "aborted → 推理块 completed + 无错误块";
});

await test("回归/工具执行中停止：必须收尾为 aborted，不能留下永远 streaming 的消息", async () => {
  const runtime = createConversationRuntime("conv-abort-tool", {
    config: configFor("tools-multi"),
    persist: false,
    toolExecutor: async () => {
      await sleep(400);
      return "跑完了";
    },
  });
  const pending = runtime.sendAsync("跑到一半停止");
  await sleep(150); // 此刻模型已要了两条调用，执行器还在 await
  eq(runtime.getState().phase, "tool_call", "停止前应停在 tool_call 阶段");
  runtime.stop();
  await pending;

  const state = runtime.getState();
  eq(state.phase, "aborted", "必须收尾为 aborted（修复前会停在 streaming，Composer 的停止键不复位）");
  eq(state.error, null, "中断不记 error");
  eq(state.messages.length, 2, "不许多出下一条空助手消息");
  eq(state.messages[1].streaming, false, "消息不能停在 streaming:true");
  eq(state.messages[1].aborted, true, "消息标记 aborted");
  eq(state.activeMessageId, null, "activeMessageId 清空");
  return "工具执行中 stop() → aborted 收尾，无残留 streaming";
});

await test("事件映射/错误：message.error → 官方错误块 ErrorNode（SPEC §12），正文不再重复一遍", async () => {
  const runtime = createConversationRuntime("conv-map-error", {
    config: configFor("error401"),
    persist: false,
  });
  await runtime.sendAsync("会失败");
  const assistant = assistantOf(runtime.getState())[0];

  eq(assistant.content, "", "正文保持空（错误只走 message.error）");
  eq(messageToBlocks(assistant).length, 0, "错误不是 block-adapter 的产物：它由 Message.tsx 拼 ErrorNode");
  const node = rtTypes.toDisplayErrorNode(assistant.error, assistant.id);
  eq(node.kind, "error", "块类型");
  eq(node.id, `${assistant.id}-error`, "块 id 稳定（React key）");
  eq(node.status, "failed", "失败态");
  eq(node.title, "请求失败", "推断译文（en: Stream error / System error，SPEC §12）");
  assert(node.message.indexOf("认证失败") !== -1, "块正文 = 中文错误文案");
  eq(node.defaultExpanded, true, "正文默认可见（SPEC §12 是「段落 + 正文」，藏起来就没意义）");
  return "kind=auth → error 块（title 为推断译文）";
});

// ═══════════════ 收尾 ═══════════════

server.close();
if (server.closeAllConnections) server.closeAllConnections();
rmSync(sandbox, { recursive: true, force: true });

const failed = results.filter((result) => !result.pass);
const report = {
  ok: failed.length === 0,
  suite: "src/chat/runtime",
  passed: results.length - failed.length,
  failed: failed.length,
  total: results.length,
  results: results.map((result) => ({ name: result.name, pass: result.pass, detail: result.detail })),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stderr.write("\n=== src/chat/runtime selftest ===\n");
for (const result of results) {
  process.stderr.write(`${(result.pass ? "PASS  " : "FAIL  ") + result.name}\n        ${result.detail}\n`);
}
process.stderr.write(`${report.passed}/${report.total} 通过\n\n`);
process.exitCode = report.ok ? 0 : 1;
