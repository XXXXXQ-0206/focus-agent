#!/usr/bin/env bash
# 开发模式：后端(:8787) + 流量代理(:8788) 与两套前端一起跑。
# Codex renderer 使用 :3000，原生 ARTEX Web 使用 :3001；不要复用旧的 :5173。
# 前端 /api 反代到后端；Ctrl-C 一并退出。
#
# 单二进制（前端内嵌）方式见 README「单二进制」一节，不走这个脚本。
set -euo pipefail
cd "$(dirname "$0")"

# 退出时结束本进程组内的所有子进程（后端 + 前端）。
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# 后端（普通 go run，不内嵌前端）；并发 work agent 数在「系统设置」里配置。
go run ./cmd/artex -addr :8787 -proxy 127.0.0.1:8788 &

# 两套前端热更新（/api 都反代到 :8787）。嵌入式宿主中对应 / 与 /artex/。
( cd frontends/codex-client && npm run dev -- --port 3000 ) &
( cd frontends/artex-web && npm run dev -- --port 3001 ) &

echo "[dev] 后端 :8787 / 代理 :8788 / Codex http://localhost:3000 / ARTEX http://localhost:3001  (Ctrl-C 退出)"
wait
