# ARTEX Codex Client Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Codex-style ARTEX frontend with a Codex Desktop-derived shared Vite/React renderer while preserving the native ARTEX frontend, real ARTEX behavior, and one switchable Electron client.

**Architecture:** `frontends/codex-client` owns the shared renderer and a typed ARTEX adapter. `frontends/artex-web` remains the native UI. The existing ARTEX Go server remains the API/SSE authority and embeds isolated static roots at `/` and `/artex/`; the existing Electron host keeps backend lifecycle and exposes only a narrow platform adapter.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, Radix/Lucide, TanStack Query, React Router, ARTEX Go HTTP/SSE API, Electron host.

**Spec:** `docs/superpowers/specs/2026-10-13-codex-client-rebuild-design.md`

## Global Constraints

- Keep `frontends/artex-web/` intact and independently buildable.
- Keep the legacy `web/` until the migration matrix and runtime verification pass; never delete it as a shortcut.
- Do not change ARTEX API, auth, database, task-control, or dangerous-operation semantics to fit Codex mock data.
- Do not copy Codex Electron main/preload or expose Node, filesystem, or arbitrary IPC to the renderer.
- Access tokens stay in the existing browser storage contract; refresh uses the HttpOnly cookie and `/api/auth/refresh`; long-lived tokens never enter URLs or logs.
- SSE uses the existing `/api/sse-ticket` one-time ticket flow and reconnects by obtaining a fresh ticket.
- Every migrated route must have loading, empty, error, success, and disabled states; no mock fixture or fake success remains in completed routes.
- Web and Electron use the same renderer build; only the platform adapter differs.
- Windows scripts must not rely on POSIX-only inline environment assignment syntax.

---

### Task 1: Create the Codex renderer package and design-system baseline

**Files:**
- Create: `frontends/codex-client/package.json`, `frontends/codex-client/package-lock.json`
- Create: `frontends/codex-client/index.html`, `frontends/codex-client/vite.config.ts`, `frontends/codex-client/tsconfig.json`, `frontends/codex-client/tsconfig.node.json`
- Create: `frontends/codex-client/src/main.tsx`, `frontends/codex-client/src/app.tsx`, `frontends/codex-client/src/styles/*`
- Create: `frontends/codex-client/src/shell/*`, `frontends/codex-client/src/ui/*`, `frontends/codex-client/src/icons/*`
- Create: `frontends/codex-client/CODEX-SOURCE-NOTICE.md`
- Test: `frontends/codex-client` typecheck and Vite build

**Interfaces:**
- Consumes the copied renderer assets and component patterns from `C:\Users\熊骞\Desktop\artex\codex-desktop-src`.
- Produces a Vite app with root base `/`, a stable `AppShell`, theme bootstrap, route outlet, and platform adapter injection point.

- [ ] Copy only renderer source, UI styles, icons, and required dependency metadata from the Codex source; exclude `.git`, `node_modules`, `dist`, `.scratch`, analysis artifacts, Electron main/preload, and mock-only build output.
- [ ] Replace source aliases and environment assumptions with `import.meta.env`-compatible Vite configuration and a typed `src/platform/host.ts` interface.
- [ ] Implement `main.tsx` and `app.tsx` so the shell renders a deterministic loading, error, and content state without contacting a mock API.
- [ ] Add the Codex shell geometry and tokens, including the measured 288px side rail, 768px primary content constraint, 44px top strip, and responsive narrow-screen behavior.
- [ ] Run `npm install`, `npm run typecheck` (or the equivalent declared check), and `npm run build` from `frontends/codex-client`.
- [ ] Commit as `feat: scaffold shared codex renderer`.

### Task 2: Implement the ARTEX typed service, auth, and SSE adapter

**Files:**
- Create: `frontends/codex-client/src/artex/api.ts`, `frontends/codex-client/src/artex/auth.ts`, `frontends/codex-client/src/artex/sse.ts`, `frontends/codex-client/src/artex/types.ts`, `frontends/codex-client/src/artex/query-client.ts`
- Create: `frontends/codex-client/src/platform/web.ts`, `frontends/codex-client/src/platform/electron.ts`
- Modify: `frontends/codex-client/src/app.tsx`, `frontends/codex-client/vite.config.ts`
- Test: `frontends/codex-client/src/artex/*.test.ts`

**Interfaces:**
- Consumes the existing `/api/*` contract and `web/src/lib/api.ts`, `auth.ts`, `auth-refresh.ts`, and `types.ts` as compatibility references.
- Produces typed `apiFetch`, `login`, `refresh`, `logout`, `issueSseTicket`, `connectSse`, query helpers, and a host adapter with allowlisted external navigation.

- [ ] Port only the required ARTEX request/response types and make unknown server additions forward-compatible.
- [ ] Implement one-refresh-at-a-time 401 handling; retry the original request exactly once and return an auth-expired error when refresh fails.
- [ ] Preserve `localStorage["artex_token"]` and `credentials: "include"`; never print token values and never append them to a URL.
- [ ] Implement SSE ticket POST, stream URL construction using the short-lived ticket, close/error handling, and reconnect that obtains a new ticket.
- [ ] Add tests for successful auth, concurrent 401 refresh coalescing, refresh failure, ticket issuance, ticket expiry/reconnect, and redacted error logging.
- [ ] Configure Vite `/api` proxy to the local ARTEX backend without adding a second auth path.
- [ ] Commit as `feat: add artex auth api and sse adapter`.

### Task 3: Migrate the first vertical slice: login, shell, Chat, and live task steering

**Files:**
- Create: `frontends/codex-client/src/routes/login.tsx`, `frontends/codex-client/src/routes/chat.tsx`, `frontends/codex-client/src/chat/*`, `frontends/codex-client/src/tasks/steer.ts`
- Modify: `frontends/codex-client/src/app.tsx`, `frontends/codex-client/src/shell/*`, `frontends/codex-client/src/artex/*`
- Test: focused React tests for login, composer send, stream rendering, and steer submission

**Interfaces:**
- Consumes Task 2 service methods and the copied Codex chat/composer patterns.
- Produces routes `/login`, `/chat`, and a running-task steer control using `GET/POST /api/tasks/{id}/steer`.

- [ ] Implement login, initialization/password-change states, logout, and redirect behavior with real API responses and disabled/loading/error states.
- [ ] Implement conversation loading, message send, upload/reference handling where the existing ARTEX API supports it, and SSE event rendering.
- [ ] Implement a running-task operator composer that sends steer text without cancelling/restarting the task; show pending, accepted, rejected, and permission-denied states.
- [ ] Verify keyboard input, focus, Enter/Shift+Enter behavior, and responsive composer geometry in the browser.
- [ ] Commit as `feat: migrate chat and live steering slice`.

### Task 4: Migrate task, findings, evidence, intranet, and settings surfaces

**Files:**
- Create: `frontends/codex-client/src/routes/tasks.tsx`, `frontends/codex-client/src/routes/findings.tsx`, `frontends/codex-client/src/routes/intranet.tsx`, `frontends/codex-client/src/routes/settings.tsx`
- Create: `frontends/codex-client/src/features/tasks/*`, `findings/*`, `evidence/*`, `intranet/*`, `settings/*`
- Modify: `frontends/codex-client/src/shell/routes.tsx`, `frontends/codex-client/src/artex/types.ts`, `frontends/codex-client/src/artex/api.ts`
- Test: route smoke tests and focused state tests for list/detail, empty/error, destructive confirmation, and disabled states

**Interfaces:**
- Consumes the typed service layer and preserves the existing domain endpoints and dangerous-operation confirmation semantics.
- Produces direct-loadable routes for dashboard, tasks, findings/evidence, intranet, and system settings with Codex list/detail/inspector patterns.

- [ ] Build a migration matrix from every completed `web` route to its new route and mark unsupported routes explicitly instead of rendering fixtures.
- [ ] Port tasks list/detail, filters, event timeline, task controls, and approval dialogs.
- [ ] Port findings/evidence lineage, retest/traffic evidence, and source association without changing server semantics.
- [ ] Port intranet topology/session/tunnel/file panels and preserve redaction and confirmation rules.
- [ ] Port LLM, agents, tools, MCP, logs, interception, and approval settings with real mutations and visible result states.
- [ ] Commit as `feat: migrate artex operational surfaces`.

### Task 5: Add remaining routes and migration gate

**Files:**
- Create/modify: `frontends/codex-client/src/routes/*` and `frontends/codex-client/src/features/*` for assets, traffic, workspace, commands, sync, and LLM records
- Create: `frontends/codex-client/MIGRATION-MATRIX.md`
- Test: route enumeration and direct-link smoke checks

**Interfaces:**
- Consumes all typed API methods needed by the existing ARTEX route inventory.
- Produces no-legacy-mock route coverage and a documented gate for deleting `web/`.

- [ ] Enumerate the old `web/src/app` route tree and map each route to the new renderer or an explicit native-ARTEX fallback.
- [ ] Port the remaining completed surfaces using the same Codex toolbar/list/detail and state conventions.
- [ ] Add direct-load tests for every migrated route, including refresh and deep-link behavior.
- [ ] Search the new package for mock fixtures, placeholder success handlers, old Next aliases, and long-lived tokens in URLs; fail the gate when found.
- [ ] Commit as `feat: complete codex route migration matrix`.

### Task 6: Build and embed both UIs in Go, then add desktop UI switching

**Files:**
- Create/modify: `frontends/codex-client/scripts/build-static.*`, `frontends/artex-web/next.config.mjs`
- Modify: `build.sh`, `Dockerfile.source`, `install.sh`, `update.sh`, `.gitignore`
- Modify: `server/webui_embed.go`, `server/webui_stub.go`, related web UI tests/docs
- Modify: `desktop/main.js`, `desktop/README.md`, `desktop/package.json` only for the allowlisted UI-switch behavior
- Test: Vite build, Next static build, Go embed/stub build, desktop package checks, and `/` plus `/artex/` smoke tests

**Interfaces:**
- Consumes the two static output directories from Tasks 1 and 5.
- Produces same-origin `/` Codex UI and `/artex/` native UI, isolated SPA fallbacks, and one Electron host with a visible UI switch.

- [ ] Build Vite output at root and Next output with `/artex` base path into isolated embed directories.
- [ ] Update Go static handlers so API routes remain API routes, assets resolve under their owning prefix, and deep links fall back only within that prefix.
- [ ] Add tests for root, `/artex/`, static assets, deep links, missing files, and API non-interference.
- [ ] Add a desktop switch that changes between `/` and `/artex/` without a second renderer or arbitrary IPC exposure.
- [ ] Run Windows build commands through explicit PowerShell environment assignment and verify `go build -tags embedui`.
- [ ] Commit as `feat: embed dual artex frontends and desktop switch`.

### Task 7: Verify, document, and remove legacy `web/`

**Files:**
- Modify: `README.md`, `frontends/README.md`, `desktop/README.md`, CI/build docs
- Delete only after the gate: `web/`
- Test: full frontend/build/browser verification and final reference scan

**Interfaces:**
- Consumes the migration matrix, dual static build, and runtime verification from Tasks 1-6.
- Produces the final repository with native ARTEX UI retained and no stale build references to the removed legacy client.

- [ ] Run Vite typecheck/build, native ARTEX static build, Go package tests excluding the known Windows security-software-blocked test when necessary, and embed build.
- [ ] Run browser checks at desktop and narrow viewports: page identity, meaningful DOM, no framework overlay, console health, screenshot, login input, Chat send, steer submission, `/artex/` switch, and deep-link refresh.
- [ ] Capture computed geometry for sidebar, main content, top strip, composer, detail pane, and settings rows; record any intentional deviations.
- [ ] Delete `web/` only after all migrated routes pass and `rg` confirms no build, embed, script, or docs reference remains.
- [ ] Re-run builds and route smoke tests after deletion; commit as `chore: retire legacy web client`.

