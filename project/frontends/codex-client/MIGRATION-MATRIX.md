# Codex Client Route Migration Matrix

This matrix records the route inventory inherited from the removed legacy Codex Web. The shared renderer owns the Codex-facing routes, while the preserved native ARTEX frontend owns the complex ARTEX routes below `/artex/`. “Basic” means a working initial surface, not full behavior parity inside the Codex renderer.

| Historical legacy route | Current destination | Status |
| --- | --- | --- |
| `/(external)` (`/`) | `/` | Basic: Codex entry route; the former ARTEX root behavior is not parity-complete. |
| `/(auth)/login` (`/login`) | `/login` | Basic: auth screen implemented; full parity not established. |
| `/(auth)/setup` (`/setup`) | `/init` | Basic: initialization/auth screen state implemented; full parity not established. |
| `/(main)/dashboard` (`/dashboard`) | `/artex/dashboard` | Native ARTEX fallback; not migrated. |
| `/(main)/chat` (`/chat`) | `/chat` | Basic: Codex chat surface; full parity not established. |
| `/(main)/function/assets` (`/function/assets`) | `/assets` | Basic: migrated inventory list; native detail/edit operations remain fallback. |
| `/(main)/function/commands` (`/function/commands`) | `/artex/function/commands` | Native ARTEX fallback; not migrated. |
| `/(main)/function/findings` (`/function/findings`) | `/findings` | Basic: migrated paginated findings list/filter; native detail/retest/edit operations remain fallback. |
| `/(main)/function/findings/detail` (`/function/findings/detail`) | `/artex/function/findings/detail` | Native ARTEX fallback; not migrated. |
| `/(main)/function/llm-records` (`/function/llm-records`) | `/artex/function/llm-records` | Native ARTEX fallback; not migrated. |
| `/(main)/function/sync` (`/function/sync`) | `/artex/function/sync` | Native ARTEX fallback; not migrated. |
| `/(main)/function/tasks` (`/function/tasks`) | `/function/tasks` | Adapted: Codex renderer with real ARTEX task inventory, search, refresh, and links into task activity. |
| `/(main)/function/tasks/detail` (`/function/tasks/detail`) | `/artex/function/tasks/detail` | Native ARTEX fallback; this legacy index route remains distinct from `/function/tasks/:taskId`. |
| `/(main)/function/traffic` (`/function/traffic`) | `/function/traffic` | Adapted: Codex renderer backed by the real ARTEX traffic endpoint, with loading, empty, error, and refresh states. |
| `/(main)/function/workspace` (`/function/workspace`) | `/artex/function/workspace` | Native ARTEX fallback; not migrated. |
| `/(main)/intranet` (`/intranet`) | `/artex/intranet` | Native ARTEX fallback; not migrated. |
| `/(main)/system/agents` (`/system/agents`) | `/artex/system/agents` | Native ARTEX fallback; not migrated. |
| `/(main)/system/agents/detail` (`/system/agents/detail`) | `/artex/system/agents/detail` | Native ARTEX fallback; not migrated. |
| `/(main)/system/intercept` (`/system/intercept`) | `/artex/system/intercept` | Native ARTEX fallback; not migrated. |
| `/(main)/system/intercept/approvals` (`/system/intercept/approvals`) | `/approvals` | Basic: migrated pending approval queue and allow/deny; native history/detail remains fallback. |
| `/(main)/system/llm` (`/system/llm`) | `/system/llm` | Adapted: Codex renderer backed by the real ARTEX LLM configuration and profile endpoints. |
| `/(main)/system/logs` (`/system/logs`) | `/artex/system/logs` | Native ARTEX fallback; not migrated. |
| `/(main)/system/mcp` (`/system/mcp`) | `/system/mcp` | Adapted: Codex renderer backed by the real ARTEX MCP endpoint. |
| `/(main)/system/settings` (`/system/settings`) | `/artex/system/settings` | Native ARTEX fallback; not migrated. Codex `/settings` is a basic shell settings surface, not parity for this legacy route. |
| `/(main)/system/skills` (`/system/skills`) | `/system/skills` | Adapted: Codex renderer backed by the real ARTEX skills endpoint. |
| `/(main)/system/tools` (`/system/tools`) | `/system/tools` | Adapted: Codex renderer backed by the real ARTEX tools endpoint. |

The Codex client also exposes `/init`, `/tasks`, `/task/:taskId`, and `/settings`; these are Codex-facing paths rather than replacements with full parity for similarly named ARTEX routes. The native frontend remains the behavior-complete owner of the complex ARTEX pages.

## Legacy Web Removal

The legacy root `web/` client has been removed. The deletion is safe because the embedded host now serves the shared Codex renderer at `/` and the preserved native ARTEX export at `/artex/`; the build, release workflow, desktop host, and development script no longer depend on the old directory. This records routing ownership, not full visual or behavioral parity between the two products.
