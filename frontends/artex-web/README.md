# ARTEX Web

这是 Focus Agent 仓库中的原始 ARTEX Web 前端快照，来源为 `artex-ymh/upstream/main` 的提交 `1e0ebcc5b58e69d2b5893578d18dd58a674a9146`。

它与 [`../codex-client/`](../codex-client) 并列：Codex renderer 是开发中的新客户端，本目录保留 ARTEX 的传统控制台体验。两者都通过 `/api/*` 访问同一个 Go 服务，默认后端地址为 `http://localhost:8787`。

```bash
npm ci
npm run dev -- --port 3001
```

生产或静态构建：

```bash
npm run build
# 或
npm run build:static
```

本目录不包含 `node_modules`、`.next` 或 `out` 等本机构建产物。需要切换后端地址时设置 `AUTOPENTEST_API`；只做界面演示时可以设置 `NEXT_PUBLIC_MOCK=1`。
