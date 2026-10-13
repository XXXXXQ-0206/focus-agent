# Focus Agent 前端

仓库保留两套可以连接同一 Go API 的前端：

| 目录 | 定位 | 状态 |
| --- | --- | --- |
| [`../web`](../web) | Focus Agent 的类 Codex 风格 Web 客户端，包含任务对话、实时插话和 Codex 式工作区外壳。 | **开发中**，是当前单体构建默认嵌入的前端。 |
| [`artex-web`](artex-web) | 原始 ARTEX Web 控制台，保留任务、资产、发现、系统设置等传统控制台布局。 | 从 `artex-ymh/upstream/main` 固定提取，作为独立前端维护。 |

两套前端共用仓库根目录的 Go API，默认反代地址为 `http://localhost:8787`。它们是两份独立的 Next.js 工程，源码、依赖和构建产物互不复用；不要把 `artex-web` 的源码覆盖到 `../web`，否则会丢失 Codex 客户端的实时插话和 API 绑定。

## 来源

`artex-web` 在 2026-10-13 从本地 `artex-ymh` 的 `upstream/main` 提取，固定源提交为：

```text
1e0ebcc5b58e69d2b5893578d18dd58a674a9146
```

这是未引入 Codex 壳层的 ARTEX Web 基线。`artex-ymh` 自己的 `origin/main` 已包含后续 Codex 适配提交，因此本目录没有使用它作为“原始 Web”来源。

## 本地启动

先启动 Focus Agent Go 服务（默认 `:8787`），再在对应目录安装依赖并启动前端：

```bash
# Codex 风格 Web（开发中）
cd web
npm ci
npm run dev -- --port 3000

# 原始 ARTEX Web
cd ../frontends/artex-web
npm ci
npm run dev -- --port 3001
```

如 Go API 不在 `localhost:8787`，可设置 `AUTOPENTEST_API` 指向实际地址。`NEXT_PUBLIC_MOCK=1` 可用于只验证界面，不连接后端。
