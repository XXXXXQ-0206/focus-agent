# Codex 风格客户端重构设计

日期：2026-10-13

状态：待用户复核

范围：本地重构 ARTEX Codex 风格前端，并使原生 ARTEX 前端与 Codex 风格前端都可用于 Web 和桌面客户端。

## 1. 目标与边界

- 使用 `C:\Users\熊骞\Desktop\artex\codex-desktop-src` 的 renderer 作为新客户端基础，保持其 Codex shell、页面组件、交互密度、token 和语义样式规范。
- Web 与 Electron 共用同一份 React renderer 和 ARTEX 业务数据层；宿主能力通过平台适配层区分。
- 单个 ARTEX 桌面客户端可在 Codex 风格 UI 和原生 ARTEX UI 之间切换。
- 保留 `frontends/artex-web/` 原生 ARTEX 前端，不把它合并成 Codex 风格，也不删除。
- 完成 ARTEX 业务页迁移和行为验证后，再删除当前 `web/`。不因视觉重构改变 Go 后端 API、认证语义或业务数据。
- 本阶段只在本地开发，不推送远端、不发布桌面包；源码许可和公开分发边界单独核验。

## 2. 现状与证据

### 2.1 Codex Desktop 来源

来源工程是 Vite 8、React 19、TypeScript、Tailwind v4、Radix、TanStack Query 和 React Router 工程。渲染层以 `src/main.tsx`、`src/App.tsx`、`src/shell/routes.tsx` 为入口，页面和通用组件按 `shell`、`chat`、`settings`、`pages`、`ui`、`icons`、`styles` 分域。

来源工程不包含 ARTEX 业务适配：其 API client 面向 OpenAI-compatible chat completions；聊天和若干页面使用 mock/localStorage 状态。因此保留 UI 结构与设计系统，替换数据、会话、认证和命令处理；不得将 mock 页面误当成已接入的 ARTEX 功能。

只引入 renderer、Vite/TypeScript 配置、必要 UI 依赖及架构/归属说明。排除来源仓库 `.git`、`node_modules`、构建输出、`.scratch`、包分析/取证脚本与产物。Codex 重建的 Electron 主进程/preload 不作为 ARTEX runtime；保留 ARTEX 当前 Electron 生命周期、后端管理和托盘实现，只在需要时增加最小 allowlist 平台桥。

来源 `package.json` 声明 Apache-2.0，但未发现顶层 `LICENSE`；其 README 和第三方说明提到从发行产物搬运的官方资产。保留来源说明和可用的许可文件；公开分发前必须核查许可与署名，不在本地方案中作法律结论。

### 2.2 ARTEX 当前实现

- 当前 `web/` 是 Next.js 客户端，包含 Codex 风格 shell，也包含 ARTEX 完整业务页、约 1,200 行 API wrapper 和业务类型；不是可直接删除的纯 UI 壳。
- `frontends/artex-web/` 是原始 ARTEX 前端快照，应作为独立 UI 保留。
- `server/webui_embed.go` 目前只嵌入一套静态 UI；`build.sh`、`Dockerfile.source`、`install.sh`、`update.sh` 固定引用 `web/` 的 Next 静态产物。
- `desktop/main.js` 启动或连接 ARTEX 后端并加载 `127.0.0.1:8787/`。保留其 ARTEX 后端进程、托盘、退出清理与单实例语义。
- ARTEX 认证用 Bearer access token 和 HttpOnly refresh cookie。普通 API 使用 `/api`；401 时通过 `/api/auth/refresh` 刷新并重试。
- SSE 先 POST `/api/sse-ticket` 取 60 秒一次性 ticket，再连接流端点。流连接不能因迁移丢失 ticket 生命周期、关闭和重连行为，access token 不得放进 URL。

## 3. 目标结构与路由

```text
frontends/
  codex-client/       # 新 Vite/React renderer，Web 与桌面共用
  artex-web/          # 保留原生 ARTEX 前端
desktop/              # ARTEX Electron host；窄范围平台适配
server/webui/dist/    # Go binary 使用的双前端静态产物
```

开发端口保持用户当前习惯：Codex 风格前端由 Vite 提供 `http://localhost:3000`，原生 ARTEX 前端由其 Next 开发服务提供 `http://localhost:3001`。新前端迁移期间与现有 `web/` 并行运行；未达到切换门槛之前，不停掉或覆盖现有开发入口。

生产与桌面端由同一 ARTEX Go 服务同源提供两套 UI：`/` 默认进入 Codex 风格 renderer，`/artex/` 进入原生 ARTEX UI。两侧均有明确的 UI 切换入口。桌面 Electron 继续加载本地 Go 服务，不独立维护第二份 React 页面。Go 静态 handler 按挂载前缀选择各自的入口和 SPA fallback；静态资源、深层路由和 `/api` handler 不互相覆盖。

Next 原生前端静态导出时需配置 `/artex` base path；Vite 客户端需配置 root base。构建脚本分别生成两套输出，再同步到 `server/webui/dist/` 的隔离目录。Windows 构建不得依赖 POSIX-only 的 `NEXT_EXPORT=1 command` 写法。

## 4. 组件与业务映射

| ARTEX 功能域 | Codex 组件/页面规范 | 保留的 ARTEX 行为 |
|---|---|---|
| 登录、初始化 | Codex 表单控件、间距、提示和 Dialog 规范 | ARTEX 登录、初始化、密码修改及 refresh 流程 |
| Chat、任务插话 | `ChatConversation`、Composer、Message/blocks、ArtifactPanel | ARTEX conversation/task API、上传与引用、SSE、运行中任务 steer |
| 任务列表/详情 | 列表/详情分栏、行、工具栏、filter/search、状态和事件时间线 | 原有详情 tabs、覆盖/关系图、事件流、任务控制和审批行为 |
| Findings/证据 | Codex detail pane、inspector、timeline 和 evidence 区域 | lineage、复测、流量证据及原有证据来源关联 |
| Intranet | Codex split pane、tabs、terminal/file 面板和统一行控件 | ARTEX 拓扑、会话、隧道、文件操作及脱敏规则 |
| System/settings | 设置行/卡片、Menu、Popover、Dialog、表格模式 | ARTEX LLM、agents、tools、MCP、日志、拦截/审批真实接口 |
| Assets/traffic/workspace 等 | Codex toolbar、列表、筛选、detail panel 和状态样式 | 领域图表、上传/下载、编辑、删除及二次确认语义 |

复用优先级：先复用 Codex `src/ui` 和 shell 基础件，再复用 chat/settings/page pattern；ARTEX 特有的图、拓扑、证据可视化和数据表继续使用其现有领域组件，按 Codex token 与容器规范整合，不为了复用而改造成错误的抽象。所有生产路由都必须接 ARTEX 服务；未完成的功能应显式标为不可用或留在未切换的旧客户端，不可保留假数据或空操作。

## 5. 数据、认证与桌面边界

- 新建 ARTEX typed adapter/service 层，将 API 调用、认证刷新、SSE ticket、数据类型和 React Query hooks 与 Codex UI 分离。迁移当前 `web/src/lib/api.ts`、`types.ts` 的必要合同，移除 Next 专属 `process.env`、alias 和 rewrite 假设。
- Vite 开发服务将 `/api` 代理到 Go 后端。SSE 继续使用一次性 ticket；开发环境可直接连 loopback Go 流端点，生产 Go 嵌入部署使用同源地址。不得把长期 Bearer token 写入 query、日志或桌面 URL。
- 共享 UI 只依赖平台 adapter。Web adapter 处理浏览器导航；Electron adapter 仅提供明确 allowlist 的窗口/外链能力。禁用 renderer 的 Node 集成，不暴露 `ipcRenderer`、文件系统或任意 IPC 通道。
- 保留 ARTEX 后端路由、权限、任务控制及危险操作确认。所有列表/表单操作都要接真实接口并呈现 loading、empty、error、success 和 disabled 状态。

## 6. 迁移顺序

1. 以当前干净提交 `79a95ff` 为回滚基线；保持旧 `web/` 不变，先创建新 renderer 源目录并导入必要 Codex renderer/样式/依赖/署名资料。
2. 先实现 shell、登录/初始化、主题、路由、平台 adapter 和 ARTEX API/auth/SSE 层；建立旧 `web/` 路由到新 renderer 的迁移矩阵。
3. 按纵向切片迁移：Chat 与实时插话；任务列表/详情；Findings/证据；Intranet；System/settings；其余 Assets、Traffic、Workspace、Commands、Sync、LLM records 等页面。
4. 每个切片完成 API、错误/空/加载状态和交互验收后，再进入下一组；新旧客户端并行可运行。
5. 双 UI build 和 Go 路由落位：分别构建 Vite 与 Next 输出，挂到 `/` 和 `/artex/`；添加桌面内切换并验证 API/SSE/深链接。
6. 完成全路由验收后，更新 `build.sh`、`Dockerfile.source`、`install.sh`、`update.sh`、Go embed/stub 文档、`.gitignore`、CI 和 README。检查无脚本仍引用已删除的 `web/` 产物后，才移除旧 `web/`。

## 7. 验收与切换门槛

- 构建：Codex `typecheck`、Vite build；原生 ARTEX static build；Go 单测和 `-tags embedui` 构建；Windows 与容器构建路径均覆盖。
- 路由：迁移矩阵中的登录、Chat、Dashboard、任务、发现、资产、命令、同步、流量、工作区、内网和 system 页面均能通过直达深链接加载；双 UI 的刷新、静态资源和 SPA fallback 正常。
- 认证：登录/初始化/登出；并发 401 只触发正确 refresh；HttpOnly cookie 刷新成功与失效后回登录。
- 实时行为：真实任务 Chat/SSE 收到事件；ticket 过期、连接关闭和重连重新取票；运行中 steer 通过任务 API 发出并在下一步执行前可见。
- 桌面：一个 Electron 包启动 ARTEX 后端；两种 UI 可互切；窗口收起/恢复、外链、退出与后端清理不回归。
- 视觉：按 Codex 源 token、shell、chat composer、sidebar/detail pane、settings row 等规范检查 Web 和 Electron；至少覆盖桌面宽度、当前浏览器宽度和窄屏；实际检查截图/计算样式，不以 build 通过代替视觉验收。
- 完成功能页上不留演示 fixture、假的成功反馈、不可用按钮或丢失的危险操作确认。旧 `web/` 仅在以上门槛全通过后删除。

## 8. 明确不做

- 不改 ARTEX Go API/数据库协议以迎合 Codex mock 数据。
- 不把 Codex 还原版 Electron 主进程、preload 和所有 IPC 能力替换成 ARTEX 桌面宿主。
- 不删或重写 `frontends/artex-web/` 原生前端。
- 不在全量页面迁移前删除当前 `web/`，不更改用户数据、服务配置或远端仓库。
- 不在完成许可核验前公开分发从 Codex 发行产物还原/搬运的内容。
