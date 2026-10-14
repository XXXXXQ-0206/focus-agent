(async () => {
  /**
   * 真机（Electron/Chromium 渲染进程）验证脚本 —— 由 tools/cdp-eval.mjs 注入执行。
   *
   * 为什么用「假 fetch + 真 ReadableStream」而不是真 HTTP：
   *   实测本应用页面的 CSP 是 `connect-src 'self' blob: ...`（见 dev-verify-csp.js 的输出），
   *   任何跨域 fetch 都会被 CSP 当场掐掉（TypeError: Failed to fetch + securitypolicyviolation）。
   *   所以这里替换 window.fetch，用**真的 ReadableStream 按字节喂数据**，
   *   把 Chromium 自己的流式读取、TextDecoder、AbortController 全跑一遍 ——
   *   测的是引擎行为，不是 mock。
   *   （真 HTTP/TCP 那一层由 src/api/selftest.mjs 在 Node 里跑真服务器覆盖。）
   */

  const steps = [];
  const _overlayLines = [];
  const check = (name, fn) => {
    try {
      const detailText = fn();
      steps.push({ name, pass: true, detail: detailText || "" });
    } catch (error) {
      steps.push({ name, pass: false, detail: String(error?.message || error) });
    }
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const eq = (actual, expected, label) => {
    if (actual !== expected) {
      throw new Error(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 幂等：清掉上一次运行留下的键（只清本脚本自己的，不碰 codex.settings / codex.theme / codex.api）
  for (const key of [
    "codex.conversations",
    "codex.messages.browser-e2e",
    "codex.messages.browser-tools",
    "codex.messages.browser-abort",
    "codex.messages.browser-401",
  ]) {
    localStorage.removeItem(key);
  }

  const api = await import("/src/api/index.ts");
  const rt = await import("/src/chat/runtime/index.ts");
  rt.invalidateConversationCache();
  steps.push({
    name: "import/动态导入运行时模块",
    pass: true,
    detail: "src/api + src/chat/runtime 已由 Vite 按需编译进页面",
  });

  // ───────── 真 ReadableStream 假服务端 ─────────

  const REASONING = "先看需求。";
  const PART1 = "结论：流式正确。";
  const PART2 = "\n第二段。";
  const FULL = PART1 + PART2;
  const TOOL_ARGS = '{"city":"San Francisco","unit":"celsius"}';
  const FINAL = "工具结果已收到。";

  const encoder = new TextEncoder();
  const frame = (delta, finishReason) => ({
    id: "chatcmpl-browser",
    object: "chat.completion.chunk",
    model: "fake-browser",
    choices: [{ index: 0, delta: delta, finish_reason: finishReason || null }],
  });
  const line = (payload, terminator) => `data: ${JSON.stringify(payload)}${terminator || "\n\n"}`;
  const usageLine = line({
    id: "chatcmpl-browser",
    object: "chat.completion.chunk",
    model: "fake-browser",
    choices: [],
    usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
  });

  function normalText() {
    return (
      line(frame({ role: "assistant", content: "" }), "\r\n\r\n") +
      line(frame({ reasoning_content: REASONING }), "\r\r") +
      line(frame({ content: PART1 })) +
      line(frame({ content: PART2 })) +
      usageLine +
      line(frame({}, "stop")) +
      "data: [DONE]\n\n"
    );
  }

  /** 按字节切成 1 个字符一块 —— 行、CRLF、JSON 全都会在中间被切开 */
  function chop(text) {
    return text.split("");
  }

  /** 每个字符一个 chunk（pull 模式保证每次 read 只拿到一块） */
  function streamOf(chunks, gapMs, signal) {
    let index = 0;
    return new ReadableStream({
      start(controller) {
        if (signal) {
          const abort = () => {
            try {
              controller.error(signal.reason || new DOMException("Aborted", "AbortError"));
            } catch {
              /* 已经关掉了 */
            }
          };
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }
      },
      async pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        if (gapMs) await sleep(gapMs);
      },
    });
  }

  const sseResponse = (chunks, gapMs, signal) =>
    new Response(streamOf(chunks, gapMs, signal), {
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    });

  const requests = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input?.url);
    let body = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    requests.push({ url, body });
    const model = body?.model;
    const signal = init?.signal;

    if (model === "error401") {
      return new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-br***" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (model === "slow") {
      return sseResponse(
        [line(frame({ content: "第一段。" })), line(frame({ content: "第二段。" })), "data: [DONE]\n\n"],
        60,
        signal,
      );
    }
    if (model === "tools") {
      const hasToolResult =
        Array.isArray(body.messages) && body.messages.some((message) => message.role === "tool");
      if (!hasToolResult) {
        const half = Math.floor(TOOL_ARGS.length / 2);
        return sseResponse(
          chop(
            line(
              frame({
                tool_calls: [
                  {
                    index: 0,
                    id: "call_b",
                    type: "function",
                    function: { name: "get_weather", arguments: "" },
                  },
                ],
              }),
            ) +
              line(frame({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS.slice(0, half) } }] })) +
              line(frame({ tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS.slice(half) } }] })) +
              line(frame({}, "tool_calls")) +
              "data: [DONE]\n\n",
          ),
        );
      }
      return sseResponse(
        chop(`${line(frame({ content: FINAL })) + line(frame({}, "stop"))}data: [DONE]\n\n`),
      );
    }
    return sseResponse(chop(normalText()));
  };

  const config = (model) => ({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-browser",
    model,
    timeoutMs: 5000,
    idleTimeoutMs: 5000,
    stream: true,
  });

  // ───────── 1. 引擎内穷举切分点 ─────────

  check("引擎内/SSE 解码：整段文本在任意偏移切两半都等价（Chromium 里跑）", () => {
    const text = normalText();
    const run = (chunks) => {
      const decoder = api.createSseDecoder();
      const assembler = api.createChatStreamAssembler();
      for (const piece of chunks) {
        for (const event of decoder.push(piece)) assembler.push(event.data);
      }
      for (const event of decoder.flush()) assembler.push(event.data);
      assembler.finish();
      return assembler.result();
    };
    for (let cut = 0; cut <= text.length; cut += 1) {
      const result = run([text.slice(0, cut), text.slice(cut)]);
      if (result.content !== FULL)
        throw new Error(`偏移 ${cut} 处切开后正文不一致：${JSON.stringify(result.content)}`);
    }
    const perChar = run(text.split(""));
    eq(perChar.content, FULL, "一字一节正文");
    eq(perChar.reasoning, REASONING, "一字一节推理");
    eq(perChar.usage?.totalTokens, 33, "一字一节 usage");
    return `${text.length} 个偏移点 + 一字一节全部一致`;
  });

  // ───────── 2. 真渲染进程里跑完整一轮 ─────────

  const runtime = rt.createConversationRuntime("browser-e2e", { config: config("ok"), persist: true });
  const phases = [];
  runtime.subscribe(() => phases.push(runtime.getState().phase));
  await runtime.sendAsync("你好，浏览器");

  check("渲染进程/端到端：字节级分块的真实流式全部拼接正确", () => {
    const state = runtime.getState();
    eq(state.messages.length, 2, "消息数");
    eq(state.messages[1].content, FULL, "正文");
    eq(state.messages[1].reasoning, REASONING, "推理段分离");
    eq(state.messages[1].usage?.totalTokens, 33, "usage");
    eq(state.phase, "done", "最终阶段");
    assert(phases.indexOf("streaming") !== -1, "经过 streaming");
    return `阶段 ${phases.join(" → ")} / 正文 ${JSON.stringify(FULL)}`;
  });

  check("渲染进程/持久化：真实 localStorage 里落了会话与消息", () => {
    const raw = localStorage.getItem("codex.messages.browser-e2e");
    assert(raw !== null, "codex.messages.browser-e2e 应存在");
    const parsed = JSON.parse(raw);
    eq(parsed.length, 2, "落盘消息数");
    eq(parsed[1].content, FULL, "落盘正文");
    eq(parsed[1].streaming, undefined, "streaming 不落盘");
    const index = JSON.parse(localStorage.getItem("codex.conversations") || "[]");
    assert(
      index.some((item) => item.id === "browser-e2e"),
      "会话索引里应有它",
    );
    return "localStorage 键：codex.messages.browser-e2e / codex.conversations";
  });

  check("渲染进程/请求体：model / stream / messages 真的发出去（拦在 fetch 层）", () => {
    const sent = requests[requests.length - 1];
    assert(sent !== undefined, "应至少发出一次请求");
    eq(sent.body.model, "ok", "model");
    eq(sent.body.stream, true, "stream");
    eq(sent.body.messages[sent.body.messages.length - 1].content, "你好，浏览器", "最后一条用户消息");
    eq(sent.url, "https://api.example.com/v1/chat/completions", "端点拼接");
    return `POST ${sent.url}`;
  });

  // ───────── 3. 工具回环 ─────────

  const executed = [];
  const toolsRuntime = rt.createConversationRuntime("browser-tools", {
    config: config("tools"),
    persist: false,
    toolExecutor: async (request) => {
      executed.push(request);
      return "晴天 24°C";
    },
  });
  await toolsRuntime.sendAsync("查天气");

  check("渲染进程/工具回环：按 index 拼好的参数 → 执行 → 回灌 → 第二轮收尾", () => {
    eq(executed.length, 1, "工具执行次数");
    eq(executed[0].arguments, TOOL_ARGS, "执行器收到的参数");
    const assistants = toolsRuntime.getState().messages.filter((message) => message.role === "assistant");
    eq(assistants.length, 2, "两条助手消息");
    eq(assistants[0].toolCalls[0].status, "success", "工具状态");
    eq(assistants[0].toolCalls[0].output, "晴天 24°C", "工具输出");
    eq(assistants[1].content, FINAL, "第二轮正文");
    const second = requests[requests.length - 1];
    const toolMessage = second.body.messages.find((message) => message.role === "tool");
    eq(toolMessage.tool_call_id, "call_b", "线上 tool_call_id");
    const withCalls = second.body.messages.find(
      (message) => message.role === "assistant" && message.tool_calls,
    );
    eq(withCalls.tool_calls[0].function.arguments, TOOL_ARGS, "回灌 arguments");
    return "参数完整 / tool_calls + tool_call_id 线上字段正确";
  });

  // ───────── 4. 中断 ─────────

  const abortRuntime = rt.createConversationRuntime("browser-abort", {
    config: config("slow"),
    persist: false,
  });
  const pending = abortRuntime.sendAsync("慢一点");
  await sleep(150);
  const abortStart = Date.now();
  abortRuntime.stop();
  await pending;
  const abortMs = Date.now() - abortStart;

  check("渲染进程/中途停止：AbortController 立刻收尾为 aborted 且保留半截正文", () => {
    const state = abortRuntime.getState();
    eq(state.phase, "aborted", "阶段");
    eq(state.error, null, "中断不记错误");
    assert(
      state.messages[1].content.indexOf("第一段") !== -1,
      `保留已收到内容，实际 ${JSON.stringify(state.messages[1].content)}`,
    );
    assert(abortMs < 800, `应立刻结束，实际 ${abortMs}ms`);
    return `${abortMs}ms 收尾，正文 ${JSON.stringify(state.messages[1].content)}`;
  });

  // ───────── 5. 错误分类 ─────────

  const errorRuntime = rt.createConversationRuntime("browser-401", {
    config: config("error401"),
    persist: false,
  });
  await errorRuntime.sendAsync("会失败");

  check("渲染进程/错误：401 → auth、中文文案、正文兜底可见", () => {
    const state = errorRuntime.getState();
    eq(state.phase, "error", "阶段");
    eq(state.error.kind, "auth", "错误分类");
    assert(
      state.messages[1].content.indexOf("认证失败") !== -1,
      `正文兜底：${JSON.stringify(state.messages[1].content)}`,
    );
    return `${state.error.message.slice(0, 40)}…`;
  });

  // ───────── 6. 配置持久化 + 端点推导 ─────────

  check("配置/localStorage 与端点推导", () => {
    api.updateApiConfig({ baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "sk-x" });
    const stored = JSON.parse(localStorage.getItem("codex.api") || "{}");
    eq(stored.model, "deepseek-chat", "落盘 model");
    eq(api.getApiConfig().baseUrl, "https://api.deepseek.com", "内存配置");
    eq(
      api.resolveEndpoints("https://api.deepseek.com").chatUrl,
      "https://api.deepseek.com/v1/chat/completions",
      "端点推导",
    );
    eq(api.isApiConfigured(), true, "已配置判定");
    return `codex.api = ${JSON.stringify({ baseUrl: stored.baseUrl, model: stored.model })}`;
  });

  // ───────── 截图用覆盖层（不是产品 UI，只是给截图看结论） ─────────

  const failed = steps.filter((step) => !step.pass);
  const summary = {
    ok: failed.length === 0,
    passed: steps.length - failed.length,
    total: steps.length,
    steps,
  };
  const host = document.createElement("div");
  host.id = "api-dev-verify";
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#0b0d10;color:#e8e8e8;font:12.5px/1.75 ui-monospace,Consolas,monospace;padding:26px 30px;overflow:auto;white-space:pre-wrap";
  const header =
    "ARTEX · 自定义 API 运行时 — 真机（Electron/Chromium）验证   " +
    (summary.ok ? "全部通过" : "有失败") +
    "  " +
    summary.passed +
    "/" +
    summary.total +
    "\n页面: " +
    location.href +
    "\n" +
    "─".repeat(96) +
    "\n";
  host.textContent =
    header +
    steps.map((step) => `${(step.pass ? "✔ " : "✘ ") + step.name}\n     ${step.detail}`).join("\n") +
    "\n" +
    "─".repeat(96) +
    "\n结论：本页 CSP 为 connect-src 'self'（见 dev-verify-csp.js），跨域请求会被拦截；\n本次用真 ReadableStream 按字节喂数据，验证解析 / 状态机 / 中断 / 持久化在渲染进程里全部正确。";
  document.body.appendChild(host);

  // 交给 dev-verify-shot.mjs 注入的「重载后自恢复」渲染器：
  // 本页由 Vite 开发服务器托管，别人改 src/** 会触发整页重载把覆盖层冲掉；
  // 用 sessionStorage 存结论，重载后由注入脚本重新画出来，截图就不会拍到白屏。
  try {
    sessionStorage.setItem(
      "api-dev-verify-report",
      JSON.stringify({
        ok: summary.ok,
        passed: summary.passed,
        total: summary.total,
        text: host.textContent,
      }),
    );
  } catch {
    /* 忽略 */
  }

  window.fetch = realFetch;
  return summary;
})();
