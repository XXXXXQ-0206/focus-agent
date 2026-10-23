# Focus Agent 前端

仓库只有一个 renderer：[`codex-client`](codex-client)。同一套 React 页面同时运行在 Web 与 Electron 宿主中，业务页面、状态管理、API 客户端和视觉规范完全共享。

## 结构

| 层 | 实现 |
| --- | --- |
| Renderer | Vite + React，源码位于 `frontends/codex-client` |
| Web 宿主 | Go 服务在 `/` 提供静态资源与 SPA 回落 |
| Desktop 宿主 | Electron 在 `127.0.0.1:8787` 加载同一 renderer，并额外提供本机路径选择等窗口能力 |
| API | 仓库根目录的 Go 服务，默认地址 `http://127.0.0.1:8787` |

产品界面统一使用 **Focus** 品牌。源码中的 `artex` API 路径、数据库字段和 Go 包名属于服务端兼容标识，不面向用户展示。

## 本地启动

先启动 Go 服务（默认 `:8787`），再使用 Node.js 22 或更新版本启动 renderer：

```bash
cd frontends/codex-client
npm ci
npm run dev -- --port 3000
```

开发服务器把 `/api` 反代到 `127.0.0.1:8787`。如后端不在默认地址，可设置
`AUTOPENTEST_API=http://<host>:<port>`。

生产构建：

```bash
npm run build
```

构建产物位于 `frontends/codex-client/dist`，由 `build.sh` 同步到 `server/webui/dist/codex` 并以 `embedui` 标签编译进单二进制。
