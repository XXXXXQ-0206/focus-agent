# Focus Agent Codex Web（开发中）

这是 Focus Agent 的类 Codex 风格 Web 客户端，当前仍处于开发中。它保留任务、资产和发现等 ARTEX 能力，并增加对话式任务入口、Codex 风格工作区外壳和实时任务插话。

根目录构建默认嵌入本目录；原始 ARTEX 控制台位于 [`../frontends/artex-web/`](../frontends/artex-web)，不要用原始前端覆盖本目录，否则会丢失 Codex 客户端的专用界面和任务插话 API。

```bash
npm ci
npm run dev -- --port 3000
```

开发服务器默认把 `/api/*` 反代到 `http://localhost:8787`，可通过 `AUTOPENTEST_API` 覆盖后端地址。它尚未被声明为稳定发行版。
