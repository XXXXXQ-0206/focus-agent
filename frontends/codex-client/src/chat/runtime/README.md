# 会话运行时（src/chat/runtime）接口契约

> 负责：cx-api（共享任务 task-11）。写范围：**src/api/** 与 src/chat/runtime/****。
> 本文件是给 cx-shell / cx-settings / Lead 接线用的，读完不需要再看源码。

---

## 0. 一句话

把「发消息 → 真流式 → 工具回环 → 中断 / 报错 → 落本地」做成一条可回放的状态机，
UI 只要把原来的 useChatSession 换成 useConversationRuntime，其余一行都不用改。

---

## 1. 文件地图

    src/api/                        自定义 API 接入（零第三方依赖：fetch + ReadableStream）
      types.ts                      配置 / 消息 / 事件 / 结果的全部类型
      url.ts                        Base URL → /v1/chat/completions、/v1/models 的推导
      sse.ts                        SSE 增量解码（跨分块缓冲，最容易写错的一块）
      stream.ts                     delta → content / reasoning / tool_calls 的拼接
      errors.ts                     错误分类 + 中文文案
      client.ts                     **唯一**发 fetch 的地方（超时 / 中断 / 错误体 / 模型列表）
      config.ts                     配置读写与持久化（localStorage 键 codex.api）
      use-api-config.ts             React 绑定（useApiConfig）
      selftest.mjs                  真 HTTP + 真 SSE 自测（15 组断言）
      dev-verify.js / dev-verify-csp.js / dev-verify-shot.mjs   真机（Electron）验证用

    src/chat/runtime/               会话运行时状态机
      types.ts                      TurnPhase / RuntimeMessage / RuntimeState / 会话记录
      reducer.ts                    纯函数状态机（可单测、可回放）
      store.ts                      localStorage 持久化（会话索引 + 每会话消息）
      runtime.ts                    控制器：发消息 / 停止 / 重试 / 重新生成 / 编辑重发 + 工具回环
      use-conversation-runtime.ts   React 绑定（useConversationRuntime / useRuntimeConversations）
      index.ts                      对外出口
      selftest.mjs                  端到端自测（13 组断言）

---

## 2. 接线契约（cx-shell 只需要改这一行）

    // 原：const { messages, retry, send, status, stop } = useChatSession(conversationId);
    const { messages, retry, send, status, stop } = useConversationRuntime(conversationId);

    import { useConversationRuntime } from "@/chat/runtime";
    // 或者由 src/chat/index.ts 转出去（那是你的范围）

返回值（同名同形，Composer / Message 组件零改动）：

    conversationId: string | null      草稿态为 null，首次发送后自动变成真实会话 id
    messages: RuntimeMessage[]         继承 @/lib/types 的 Message，可直接喂 <Message>
    status: "idle" | "streaming"       与 Composer 的 ChatStatus 完全一致
    phase: TurnPhase                   sending | streaming | tool_call | tool_result | done | error | aborted
    isBusy: boolean
    error: RuntimeErrorInfo | null     最近一次非中断错误（中断不算错误）
    send(text), stop(), retry(messageId?), regenerate(messageId?), editAndResend(id, text), clear()

⚠️ 两条和渲染直接相关的新约定（2026-10 收尾轮加，理由见各自源码注释）：
    1. **错误只从 message.error 出**：runtime 不再把文案回填进 content（以前是空正文才兜底）。
       渲染方必须认这个字段 —— Message.tsx 用 toDisplayErrorNode() 转成官方 ErrorBlock（SPEC §12，默认展开）。
    2. **推理段是否结束看 message.reasoningComplete**（段级），不要只用轮级的 message.streaming：
       block-adapter 只认 streaming，会把整轮的推理块都标成 running；Message.tsx 用这个字段提前收束成 completed。

可选参数（只在「该 conversationId 第一次出现」时生效，之后不重建实例 —— 重建会打断正在进行的流）：

    useConversationRuntime(conversationId, {
      initialMessages,                 // 例如 @/lib 的 useMessages(conversationId)：持久化数据优先
      onConversationCreated,           // 首页发第一条消息 → 拿到新会话 id → navigate("/c/" + id)
      toolExecutor,                    // 给了才会真执行工具；不给则工具调用停在 pending
      config,                          // 不传就读 @/api 的当前配置（每次发送时读，设置页改完立即生效）
      persist,                         // 默认 true
      maxToolRounds,                   // 默认 4
    })

---

## 3. 非 React 接口（脚本 / 测试 / 别的框架）

    import { getConversationRuntime, createConversationRuntime } from "@/chat/runtime";

    const runtime = getConversationRuntime(conversationId);   // 同 id 永远同一个实例（模块级单例，无需 Provider）
    runtime.getState();                                       // RuntimeState
    runtime.subscribe(listener);                              // 返回取消订阅函数
    runtime.send("你好");                                      // 或 await runtime.sendAsync("你好")
    runtime.stop();
    await runtime.regenerateAsync();

状态机（reducer 是纯函数，可单独回放）：

    idle
      └─(send)→ turn/start → sending
                              ├─(open)→ streaming
                              │           ├─(content 增量)→ delta.content 追加
                              │           ├─(reasoning 增量)→ delta.reasoning 追加（与正文分开）
                              │           ├─(tool_calls 增量)→ tool/upsert（同 id 合并，arguments 拼接）
                              │           ├─(usage)→ message.usage
                              │           └─(finish_reason)→ turn/finish → done
                              ├─(tool_calls + toolExecutor)→ tool_call → tool_result → 新一轮 streaming
                              ├─(异常)→ turn/error → error
                              └─(stop())→ turn/error{kind:aborted} → aborted
    ⚠️ 中断可能发生在**工具执行期间**（fetch 早就结束了，没有异常可抛）：
       runtime 在两个收尾点显式补 turn/error{aborted}，否则那条助手消息会永远 streaming:true、
       phase 卡在 streaming，Composer 的停止键再也不复位（回归用例：selftest「工具执行中停止」）。

---

## 4. 设置页需要写入哪些字段（cx-settings）

字段清单在代码里是**数据**，直接遍历它生成表单即可（顺序即渲染顺序，advanced=true 的放「高级」折叠区）：

    import { API_CONFIG_FIELDS, useApiConfig, updateApiConfig, validateApiConfig, resetApiConfig } from "@/api";

    const config = useApiConfig();             // 引用稳定的快照
    updateApiConfig({ model: "deepseek-chat" });  // 局部保存（headers 是整体替换）
    const issues = validateApiConfig(config);     // [{ field, level: "error" | "warn", message }]

字段与语义：

    baseUrl         必填  OpenAI 兼容端点。不带 /v1 会自动补成 /v1/chat/completions；
                          也可以直接填完整的 /chat/completions 地址（另一端由它反推）
    apiKey          可空  留空则不发送 Authorization 头（本地推理服务常常不校验）
    model           必填  请求体里的 model
    headers         可空  自定义请求头（api-key / x-api-key / HTTP-Referer…），同名覆盖内置头
    stream          默认 true   关闭走一次性 JSON；服务端行为不一致时会自动互相降级
    timeoutMs       默认 30000  连接 + 首包超时（钳制在 1000~600000）
    idleTimeoutMs   默认 60000  流式两块之间的最大间隔
    temperature     可空  留空则完全不发送该字段
    maxTokens       可空  同上
    systemPrompt    可空  每次请求前自动加一条 system 消息
    includeUsage    默认 false  发送 stream_options.include_usage（部分网关会因此 400）

持久化键：codex.api（与 codex.settings / codex.theme 一致的命名）。
测试连接：createApiClient(config).testConnection() → { ok, mode: "models" | "chat" | "none", models, latencyMs, error }，**不抛异常**。

---

## 5. 怎么跑自测

    cd C:\Users\熊骞\Desktop\artex\codex-desktop-src
    node src/api/selftest.mjs              # 15/15，真 node:http SSE 服务 + 真客户端
    node src/chat/runtime/selftest.mjs     # 13/13，真 HTTP + 状态机 + 持久化 + 工具回环

两个脚本都用 Node 22 自带的 module.stripTypeScriptTypes 把 **src 下的 TS 源码本身**转成 ESM 再跑，
测的是产品代码而不是复刻实现；退出码 0 = 全绿。

真机（Electron 渲染进程）验证：

    node src/api/dev-verify-csp.js  → 用 tools/cdp-eval.mjs 注入，探测本页 CSP（见第 7 节）
    node src/api/dev-verify-shot.mjs <cdpPort> src/api/dev-verify.js <out.png>
      # 一条 WebSocket 上「跑验证 + 立刻截图」，并注入「重载后自恢复」的结论覆盖层

---

## 6. 明确的边界（不要指望它做这些事）

1. **不接 OpenAI 账号**：没有登录、没有 key 托管，配置只在本机 localStorage。
2. **不做工具协议**：工具执行要由调用方通过 toolExecutor 提供（例如接 @/shell/desktop-bridge 或本地 mock）。
   不提供执行器时，模型的 tool_calls 会渲染成 pending 状态，但不会执行，也不会回灌第二轮。
3. **消息不分页**：一个会话的消息整份存在一个 localStorage 键里；超长会话（数千条）需要改成按页存储。
4. **不支持带 query 的 Base URL**（Azure 的 ?api-version= 形态）：要自己填完整 chat 端点。
5. **reasoning 字段名做了三家兼容**：reasoning_content / reasoning / thinking。
6. 所有超时默认值（30s / 60s）、标题截断长度（40 字）、工具回环上限（4 轮）都是**未实测的工程取值**
   —— 官方产品里没有「自定义 API」这个功能，不存在可对齐的官方数值。
7. 页面上发现的**重大阻塞**见第 7 节：当前 CSP 会掐掉所有跨域请求。

---

## 7. ★ 重大阻塞（需要 Lead / cx-electron 决策）

实测（真机 app:// 页面，证据脚本 src/api/dev-verify-csp.js）：

    connect-src 'self' blob: https://ab.chatgpt.com …
    → fetch("https://api.deepseek.com/v1/models")
      TypeError: Failed to fetch + securitypolicyviolation(connect-src)

也就是说：**在打包后的应用里，自定义 API 一次请求都发不出去**（开发服务器页面同样被拦，CSP 来自同一份 index.html）。
两条修法，二选一：

- 方案 A（Lead，改 index.html，5 分钟）：把连接源放宽到
      connect-src 'self' blob: https: http://127.0.0.1:* http://localhost:* …
  覆盖「云端 https + 本机回环」两类端点。缺点：CSP 变宽，且用户填 http://192.168.x.x 这类内网地址仍会被拦。
- 方案 B（cx-electron + Lead，架构上更正确）：把请求走主进程代理
  （preload 暴露 apiRequest/apiStream，主进程用 node fetch 发请求，再把 SSE 分块回传）。
  因为 src/api/client.ts 是全工程**唯一**发 fetch 的文件，替换成本只有这一个文件，
  上层 runtime / UI 一行不动。electron/ 与 preload 属于 cx-electron 的写范围，需要他配合。

在第 7 节解决之前，UI 接线后点发送会看到一条中文错误条（kind=network），
这是预期行为 —— 不是运行时坏了，而是 CSP 拦在了浏览器层。

---

## 8. 证据与出处

- 官方发行产物里**不存在** HTTP/SSE 客户端（app-server 走自有协议），所以本目录是新增能力：
  协议字段取自 OpenAI 兼容规范，数值全部标注「未实测」，没有伪造官方出处。
- 自测输出的 JSON 就是证据，可随时复跑（输出确定：分块用固定种子的伪随机）。
- 真机验证截图：C:\Users\熊骞\Desktop\artex\api-verify-9502.png（9/9 全绿）。
