# Focus Agent 前端

仓库只有一个 renderer：[`codex-client`](codex-client)。同一套 React 页面同时运行在 Web 与 Electron 宿主中，业务页面、状态管理、API 客户端和视觉规范完全共享。

## 结构

| 层 | 实现 |
| --- | --- |
| Renderer | Vite + React，源码位于 `project/frontends/codex-client` |
| Web 宿主 | Go 服务在 `/` 提供静态资源与 SPA 回落 |
| Desktop 宿主 | Electron 在 `127.0.0.1:8787` 加载同一 renderer，并额外提供本机路径选择等窗口能力 |
| API | `backend/` 中的 Go 服务，默认地址 `http://127.0.0.1:8787` |

产品界面统一使用 **Focus** 品牌。源码中的 `artex` API 路径、数据库字段和 Go 包名属于服务端兼容标识，不面向用户展示。

## 本地启动

先启动 Go 服务（默认 `:8787`），再使用 Node.js 22 或更新版本启动 renderer：

```bash
cd project/frontends/codex-client
npm ci
npm run dev -- --port 3000
```

开发服务器把 `/api` 反代到 `127.0.0.1:8787`。如后端不在默认地址，可设置
`AUTOPENTEST_API=http://<host>:<port>`。

在 renderer 目录执行以下命令构建并同步静态资源。

```bash
npm run build:static
```

构建产物位于 `project/frontends/codex-client/dist`，并同步到 `backend/server/webui/dist/codex`。从仓库根目录运行 `bash project/build.sh` 可构建包含前端的单体程序。
