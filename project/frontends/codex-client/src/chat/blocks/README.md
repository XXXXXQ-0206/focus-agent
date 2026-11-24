# src/chat/blocks —— 会话块（task-13 / A · 对话块实现）

> 真值来源：[`docs/SPEC-CONVERSATION-BLOCKS.md`](../../../docs/SPEC-CONVERSATION-BLOCKS.md)（下称 SPEC，857 行）。
> 本目录是 task-13 的**独占写范围**：只依赖 `@/icons` 与 `@/lib/utils` 两个公共 barrel，
> 不修改 `src/chat` 下的其它文件。

## 1. 对外 API（接线契约）

```tsx
import { ActivityGroup, ActivityBlock, type BlockNode } from "@/chat/blocks";

// 分组容器 = SPEC §2.1 的 div.group/agent-activity（gap 16px；grouped 档 4px）
<ActivityGroup blocks={nodes} spacing="item" />

// 单块（自测/单独嵌入时用；每个块自己就是 item 根）
<ActivityBlock block={node} />
```

`BlockNode` 是判别联合：`approval | code | diff | error | exec | file-edit | plan | reasoning | search | terminal`，
字段逐条注释在 [`types.ts`](./types.ts)。要点：

| kind | 关键字段 | 证据 |
| --- | --- | --- |
| `reasoning` | `content` / `elapsed` / `status` | 包内确证（SPEC §3）；`elapsed` 语义/格式与 zh 文案已于 2026-10-10 补证，见 §5 |
| `exec` | `command` / `output`(可含 ANSI) / `exitCode` / `shell` / `summary` | **完整实测**（SPEC §4） |
| `terminal` | `text`(ANSI) / `shell` | 包内确证（SPEC §5） |
| `file-edit` | `files[{path, added?, deleted?, lines?, tooLarge?, binary?, renamedWithoutChanges?, renderFailed?}]` | **完整实测**（SPEC §6） |
| `diff` | `path` / `lines` / 同上四种失败态 | **完整实测**（SPEC §7） |
| `code` | `code` / `language` / `wrap` | **完整实测**（SPEC §11） |
| `approval` | `action` / `status` / `reason` / `risk` / `response` | **推断**（SPEC §8） |
| `plan` | `steps[{step, status}]` / `content` / `explanation` | **推断**（SPEC §9） |
| `search` | `action` / `query` / `folder` / `results` | **推断**（SPEC §10） |
| `error` | `title` / `message` / `additionalDetails` / `reconnecting` | **推断**（SPEC §12） |

`added` / `deleted` 可选：缺省时**不渲染** `+N/−M`（不编 0）。

## 2. 关键数值 · 期望（SPEC 实测）vs 实现

实测环境：自测台 Electron（1280×816 窗口，dev server 5273）的 computed style，与 SPEC 的 dark 档逐条对照。

| 块 | 项 | SPEC 期望 | 实现 | 出处 |
| --- | --- | --- | --- | --- |
| 块头 | 摘要字形 | 14px / 21px / **430** | 14px / 21px / 430 | §2.3 |
| 块头 | 整行按钮 | `absolute inset-0` + `aria-labelledby` + `aria-expanded` | 同 | §2.1 |
| 块头 | 折叠态 | `aria-hidden` + `inert` + `pointer-events:none` | 同 | §2.1 |
| 块头 | 正文容器 | default `gap 8px / pt-2 pb-1`、indent `ps-6` | 同 | §2.1 |
| 块间距 | group gap | 16px / grouped 4px | 实测 16px / 4px | §2.1 |
| exec | 卡片 bg | rgba(255,255,255,**0.08**) | 实测 rgba(255,255,255,0.08) | §4.2 |
| exec | 卡片圆角 | **12.5px** | 实测 12.5px | §4.2 |
| exec | 卡片描边 | rgba(255,255,255,0.157)（实测 0.666667px @dpr1.5） | 1px rgba(255,255,255,0.157)（作者值，见「约定」） | §4.2 |
| exec | 类型标签行 | padding 4/8、13px/18.5714、rgba(223,223,223,.7) | 实测一致 | §4.2 |
| exec | 命令行 | 13px / **19.5px** / 430 / pre-wrap / `line-clamp-2` / r10 | 实测一致 | §4.2 |
| exec | 提示符 | `$ ` + `me-[1ch]` | 实测 margin-inline-end 7.147px（=1ch） | §4.1 |
| exec | 输出区 | max-height **144px** / `column-reverse` / `pre` / 500 / 渐隐 **2rem** | 实测 144px / column-reverse / pre / 500 | §4.2 |
| exec | 状态行 | `gap 8px`、`padding 2px 10px 4px`（按类名 pt-0.5 pb-1 px-2.5） | 实测一致 | §4.2 |
| exec | 状态图标 | 成功 = `checkmark-lg-light-12` 12×12 | 内联 SVG（catalog 逐字）12×12 | §4.5 |
| exec | 复制按钮 | hover 才出，150ms 淡入，23×23 | 实测 opacity 0→1、23×23 | §4.2/§6.1 |
| file | 列表滚动区 | max-h **224px**、渐隐 1.5rem | 实测 224px | §6.2 |
| file | 逐文件卡 | `rounded-lg border mt-1.5` | 实测 r12.5px / mt 6px | §6.2 |
| file | 卡头 | 高 **28px**、13px、`px-2.5 py-0.5` | 实测 28px / 13px / 2px 10px | §6.2 |
| file | 增删统计 | `tabular-nums tracking-tight` + git-added/deleted | 实测 tabular-nums、token 色 | §6.2 |
| diff | 滚动区 | max-height **240px** | 实测 240px | §6.2 |
| diff | `:host` 变量 | fg #fcfcfc / bg #111111 / add #00a240 / del #e02e2a | 实测一致 | §7.2 |
| diff | 行结构 | `pre[data-diff][data-indicators=bars] > code[data-unified] > div[data-gutter] > div[data-line-type]` | 同（**无 shadow DOM**，按 task-13 要求自建） | §7.2 |
| diff | 行内缩进 | `[data-column-number]{padding-inline-start: calc(var(--spacing)*10)}` = 40px | 实测 40px | §7.3 |
| code | 根 | bg rgb(24,24,24)、radius **20px**(`--radius-3xl-base`)、border-subtle、`corner-shape: superellipse(1.1)` | 实测 20px / rgb(24,24,24) / superellipse(1.1) | §11.2 |
| code | 工具条 | padding **6px 6px 6px 20px**、高 **48px**、sticky `top:-1px`、13px | 实测一致 | §11.2 |
| code | 正文 | padding **0 20px 12px**、13px、line-height `max(1.5em, 20px)`、`pre` | 实测一致 | §11.2 |
| code | 动作按钮 | **36×36**、`aria-pressed` | 实测 36×36 | §11.1 |
| code | 块外边距 | `margin-block 17.5px` | 实测 17.5px | §11.2 |
| reasoning | 正文上限 | **8.75rem = 140px**（preview/expanded）、渐隐 **1rem** | 实测 140px | §3.2 |
| reasoning | 摘要色 | `text-text/30` → hover `--color-text` | 30% → 100% | §3.2 |
| reasoning | 正文色 | `text-text/60` + `[&_*]:text-text/50` | 实测 60% / 50% | §3.3 |
| ANSI | 16 色 + 装饰 | `ansi-*-fg|bg` + `ansi-bold/dim/italic/…` | 同（+ `ansi-palette-n` / `data-ansi-truecolor-*`） | §5 |

**约定**：参考端 dpr 1.5 出现的 `0.666667px` 这类「设备像素取整」值，按本工程既有约定写**作者值 1px**
（见 [`src/chat/chat.css`](../chat.css) 顶部说明）；其余一律钉 SPEC 的实测值。

## 3. 推断实现 / 未实测（**不要宣称「与 Codex 一致」**）

> ⚠️ **参考端未实测清单（四个 rail 页面族 + 会话块形态 + 逐块折叠/展开/失败态）见 [§6](#6-参考端未实测清单2026-10-11--猎捕组发现同步轮次)** ——
> 本节只列**本目录实现侧**的推断项；§6 列的是**参考端根本没有采集**的边界（两者都要保留「未实测」标注）。

| # | SPEC §13 未实测项 | 本目录的处理 |
| --- | --- | --- |
| 1 | 推理块头 16×16 图标 | **不渲染**（无证据，不用近似图标顶替） |
| 2 | ~~推理块 zh-CN 译文~~ | ✅ **已取到官方原文**（2026-10-10）：`zh-CN-b05cfd55c534.js@1301169` ⇒「正在思考 / 已完成思考 / 已思考 {elapsed}」；原先的推断译文已作废 |
| 3 | 审批 UI（Tone / 按钮组 / Review 布局） | **推断**：骨架 + 6px 状态点 + 键值正文；**故意不渲染批准/拒绝按钮** |
| 4 | 计划 / todo UI（三态图标、步骤行） | **推断**：CSS 自绘方框/半格/实心块，不冒充官方图标 |
| 5 | 搜索块图标（`code-searching` 等未映射） | **不渲染图标** |
| 6 | 代码块语言图标 20×20 | **不渲染**（留 `languageIcon` 插槽） |
| 7 | 命令失败态图标 | **不渲染**；只给状态图标换 `--color-text-danger` 着色 |
| 8 | 折叠箭头 20×20 / 复制按钮 21×21 | 复制用 `@/icons` 的 `CodexCopy`（SPEC 确证）；**箭头形状未实测** → 自绘占位（`data-icon-evidence="unmeasured"`） |
| 9 | ANSI 真实彩色输出未实测 | 按类名/色板实现；256 色用 xterm 标准表（**推断**） |
| 10 | 浅色主题全部未实测 | 只按 dark 实测值落地 |
| 11 | 块头折展 duration 未解出 | easing 用有出处的 `--cubic-enter`，**duration 200ms 为推断**（见 `DISCLOSURE_TRANSITION`） |
| 13 | `text-size-chat` token 无声明处 | 按实测 14px / 21px 钉住 |

其它主动声明的**未实现 / 已知偏差**：

- 文件卡增删数字的**逐位滚动**动画（SPEC §6.2 `_DigitColumn_1rr6w_1`）未实现，只保留 `tabular-nums`。
- 代码块的 `Preview/Code` 预览切换与 "Scroll to bottom"（SPEC §11.3）未实现（属交互/预览子系统）。
- 说明文字：SPEC §4.2 的文字版状态行 padding（`4px 8px 4px 10px`）与它自己给的类名（`pt-0.5 pb-1 px-2.5`）不一致，
  本实现按**类名**换算 `2px 10px 4px`。
- `--color-surface`：本工程 dark 档解析到 `--app-color-background-surface`（未定义 → gray-200 `#212121`），
  与 SPEC 实测 `#181818` 不同；本目录内用局部变量 `--cx-block-surface: #181818` 钉住。
- 曾与 `src/chat/chat.css` 的 `.cx-codeblock*` / `.cx-reasoning` 类名冲突（对方是旧组件的样式），
  已把本目录的类名改为 **`.cx-codefence*`** 与 **`.cx-thought*`**，避免两边互相污染。

## 4. 自测台（截图自证）

```powershell
# 1) 起 dev server（若尚未运行）
npm run dev

# 2) 起一个**自己的** Electron 窗口指向自测台（不打扰别人的实例）
#    注意：本环境默认带 ELECTRON_RUN_AS_NODE=1，必须清掉，否则 electron 会当普通 node 跑
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx electron src/chat/blocks/dev-shot.cjs --remote-debugging-port=9800 --user-data-dir=C:\temp\codex-blocks-9800

# 3) 截图 / 量算
node tools/cdp-shot.mjs 9800 shots.png
node tools/cdp-eval.mjs 9800 probe.js
```

自测台把 `<ActivityGroup>` 挂进**真实外壳**（`@/shell` 的 AppShell，公开 barrel），
所以截图就是实机画面；数据见 [`fixtures.ts`](./fixtures.ts)（全是造出来的样例，不是官方会话内容）。

## 5. 收口记录：折叠语义（OPEN-ITEMS #7）与 elapsed（OPEN-ITEMS #11）

> 2026-10-10。两条都**先取官方证据再动手**，证据给到「文件@字节偏移」这一级。

### 5.1 exec 卡完成后必须折叠（#7）

**官方证据（包内确证，两次复核）**

| 事实 | 出处 |
| --- | --- |
| 骨架用 `useState(defaultExpanded)`，**只在挂载取值**；`defaultExpanded` 未传时按 `false` | `tool-activity-disclosure-905d1c76fb3d.js`（函数 `x`）：`p = defaultExpanded !== void 0 && defaultExpanded`、`[y,b]=useState(p)` |
| 展开态：`isExpanded = hasChildren && (running ? !manuallyCollapsed : userExpanded)` | 同上 |
| **官方没有任何调用点传 `defaultExpanded`** | 全量扫 19236 个 asset：只有 **12** 个文件出现该字面量；import `tool-activity-disclosure` 的 16 个文件（含其自身）与这 12 个的**交集只有 1 个** —— `sites-end-resource-ecc479065e0b.js@13490`，而那一处属于另一个组件 `xg`/CollapsedTurnDisclosure 的形参。8 处**直接调用点**（`agent-activity-item` / `local-conversation-sources` / `mcp-tool-item` / `sites-end-resource` 四个文件）全部是 `{icon, status, summary, children}` / `{indentContent:false, …}` 形态 |
| ⇒ 官方 `userExpanded` 恒从 false 起步 ⇒ **完成后折叠**；running 的自动展开来自 `status`，不是来自 `defaultExpanded` | 由上两条推出 |
| 另有旁证：exec 卡的专用渲染路径自己也只维护 `useState('collapsed')` + 用户点击 | `sites-end-resource-ecc479065e0b.js` 的 `Jx`（唯一渲染 `data-testid="exec-shell-body"` 的组件） |

**本工程为什么必须有「派生」而不是照抄 `useState(defaultExpanded)`**

`src/chat/block-adapter.ts` 传的是 **status 派生值**（`defaultExpanded: status === "running"`）——这是我们自己的扩展（官方没有这种用法）。
照抄官方写法就会把「流式那一瞬的 true」永久固化，于是 running → stopped/completed/failed 之后卡片还开着（OPEN-ITEMS #7 的 126.4px）。
所以 `Disclosure.tsx` 把 `userExpanded` 定义成「用户对**当前 status** 的表态」（`userChoice.{status,expanded}`），status 一迁移就回落到该 status 对应的 `defaultExpanded`。
用 render 期派生而不是 `useEffect`，避免完成瞬间闪一帧展开。

**真机 A/B（同一台机器、同一份自测脚本 = CDP 打桩的 SSE 流；两个构建之间只差这一处回退，
chromium 窗口 1280×816、页面 dpr 1.5）**

| 时刻 | 修复前（临时回退到挂载取值） | 修复后 |
| --- | --- | --- |
| running（t≈3s） | `aria-expanded=true`，disclosure **126.41px**，`aria-hidden=false` | `aria-expanded=true`，disclosure **126.41px**，`aria-hidden=false` |
| stopped（t≈16s） | `aria-expanded=true`，disclosure **126.41px**（**不折叠 = #7 的复现**） | `aria-expanded=false`，disclosure **0px**，`aria-hidden=true` / `inert` |

截图：`tmp-shots/a1-before-fix-stopped.png`（修复前·仍展开）、`tmp-shots/a1-after-fix-running.png`、`tmp-shots/a1-after-fix-stopped.png`（修复后）。
推理块的 `已完成思考` 空推理段在两侧都保持折叠（未受影响）。

### 5.2 elapsed 的语义与格式（#11：补产出方）

**语义** —— `sites-end-resource-ecc479065e0b.js` 的 `Fw(isStreaming)`：进入流式那一刻记 `Date.now()`，`completed` 翻牌那一刻算 `Date.now() - startedAt`。
⇒ **整个推理段的客户端墙钟时长**（不是首字延迟，也不是服务端上报值）。

**格式** —— `app-primary-2b28b2369958.js@590717` 的 `XYe`（由 `export { … XYe as Cm … }`@3208882 导出；`sites-end-resource` 以 `Cm as jd` 引入、在模块初始化里绑成 `zw = jd`，推理块只传 ms 一个参数）：

- 秒 = `floor(max(ms,0)/1000)`；`<1s` → `null`（`underOneSecond` 默认 `"null"`）→ 文案回落 `reasoningItem.thought`
- `<60s` → `Intl.NumberFormat(locale,{style:"unit",unit:"second",unitDisplay:"narrow"})`，**locale 默认 `"en"`（调用点没传第二参数）** ⇒ `2s`
- `≥60s` → 天/时/分/秒各自窄格式、空格连接（`trimZeroUnits=false` ⇒ 时/分/秒都写）

**实现** —— `ReasoningBlock.tsx` 的 `useReasoningElapsed`（等价 `Fw`）+ `formatElapsed`（等价 `XYe`，locale 钉 `"en"`）；
节点自带 `elapsed` 时优先用节点的（fixtures / 将来服务端给值）。

**真机实测**（22:2x，CDP 9820，同一 stub 流：推理 3 段共 ≈3.3s 后出正文）：

| 时刻 | 块状态 | `aria-expanded` | disclosure 高 | 摘要文案 |
| --- | --- | --- | --- | --- |
| 流式中（t≈1.7s） | running | `true` | 33px | **正在思考** |
| 完成后（t≈6.2s） | completed | `false` | 0px | **已思考 3s** |

截图：`tmp-shots/a2-elapsed.png` + 放大裁切 `tmp-shots/a2-elapsed-crop.png`。
短推理（<1s）仍走 `已完成思考`（同一次会话里 A1 场景即为此例）。

### 5.3 诚实边界（这次没测到的）

- **参考端（官方运行中的 App）没有采到工具卡**：`captures/blocks-conversation.json` 135 个节点里 `read_file`／工具卡 **0 命中**（`FIDELITY-AUDIT #65` 同此记录），所以 #7 的「参考端数值」**未实测**；
  上面判定「参考端完成后折叠」用的是**包内源码**（调用点全扫 + 状态机字面量），强度等同 SPEC 里「包内确证」那一档。
- `elapsed` 的官方**运行时**文案也未采到（参考端会话无推理项）：`已思考 3s` 的 `3s` 是本工程按 `XYe` 复算的结果，**不是**在官方界面上抄下来的。
- 侧栏展开时，块头摘要的前 ~54px 落在官方同款几何之下（transcript 列 x=286.3、主视口 x=340.67，两侧一致），截图里表现为被侧栏遮住一角 —— 不是本次改动引入。

### 5.4 第二轮独立复核（2026-10-10 23:0x）

> 复核用的构建目录 / 端口 / 自建 stub 都与 §5.1–§5.2 不同，README 以外的实现**没有改动**。
> 目的：确认「完成后折叠」确实由本次改动产生（A/B 因果），并把「参考端数值」的边界钉死。

**被测产物身份（E1 防回归）**

| 项 | 值 |
| --- | --- |
| webview 目录 | `CODEX_DESKTOP_WEBVIEW_DIR=C:\temp\cxblk2`（junction → `<repo>\dist-blocks2`） |
| 产物 | `assets/index-Btm-El0W.css` **368828** 字节、mtime `2026-10-10 22:41:43`；`assets/index-DsREhfSa.js` 1049441 字节 |
| 页面实际加载 | `app://-/assets/index-Btm-El0W.css`，`fetch` 回来 **368824 字符 / sha256 `b6e28bca…a7e1`** = **与磁盘文件逐字节相同**（4 的差 = UTF-8 多字节字符） |
| behave 自报 | `被测构建：index-Btm-El0W.css @ 2026-10-10T14:41:43.527Z ｜ 渲染层目录 C:\temp\cxblk2（冻结副本）` |

**驱动方式** —— `%TEMP%\cxblk2-stub.mjs`：OpenAI 兼容 SSE 桩，时间线
`0.4–1.4s 推理增量 → **3.0s tool_calls（bash / {"command":"ls -la"}）** → 3.0–12.0s 保活 → 12.0s 正文 → 12.6s [DONE]`。
应用侧 `codex.api` 指到它。这条线上：`tool_calls` 到达 = `tool_start`（`src/chat/runtime/runtime.ts:328` 写 `status:"running"`）；
流结束 = `tool_done`（`runtime.ts:340` 写 `status:"pending"`）→ 适配层 `pending → stopped`（`block-adapter.ts:47`）。
探针每 150ms 采一次全部 `.cx-block`（值不变不记），每次采样同时记录 `document.hasFocus()` / `visibilityState`。

**A/B（同一 stub、同一脚本；两个构建之间只差 `Disclosure.tsx` 一个文件）**

| 采样 | 修复前 = `dist-blocks2-b`（`useState(defaultExpanded)`） | 修复后 = `dist-blocks2`（HEAD，`userChoice` 派生） |
| --- | --- | --- |
| running（探针 ms=5733 / 5740） | `aria-expanded=true`，disclosure **126.41px** | `aria-expanded=true`，disclosure **126.41px** |
| stopped（探针 ms=17902 / 14910） | `aria-expanded=true`，disclosure **126.41px** ← **#7 复现** | `aria-expanded=false`，disclosure **0px**，`aria-hidden=true` + `inert` |

修复后的完整跳变：`126.41 →（ms 13363）103.42 →（ms 13503）0.26 →（ms 13653）0`
—— 完成那一刻走的是 200ms 折叠过渡，不是瞬时跳变。同一次运行里推理块：`正在思考`(expanded, 33px) → `已思考 2s`(false, 0px)。

截图：[`tmp-shots/b1-before-stopped.png`](../../../tmp-shots/b1-before-stopped.png)（修复前·完成后仍展开，正文 `Shell / $ ls -la / 已停止` 可见）、
[`tmp-shots/b1-after-running.png`](../../../tmp-shots/b1-after-running.png)（修复后·流式中展开，正文底部 `正在运行`）、
[`tmp-shots/b1-after-stopped.png`](../../../tmp-shots/b1-after-stopped.png)（修复后·完成后折叠）。

**同一轮跑的其余门槛（原始输出）**

- `npx tsc -b --noEmit` → exit 0
- `npx vite build --outDir dist-blocks2` → 绿（2624 modules，2.45s）
- `node tools/verify.mjs --port 9940 --url http://127.0.0.1:9956`（`vite preview --outDir dist-blocks2`）→ **几何 12/12 ｜ token 924/924 = 100.00%**（报告 `%TEMP%\cxblk2-verify.json`）
- `node tools/behave/run.mjs --port 9974 --pid 136784` → **用例 58 ｜ PASS 58 ｜ FAIL 0 ｜ BLOCKED 0**，退出码 0（报告 `%TEMP%\cxblk2-behave.json`）

**对 §5.1/§5.2 官方证据的二次比对**（逐字节，全部通过）：
`tool-activity-disclosure-905d1c76fb3d.js` 的 `p = n !== void 0 && n` / `[y,b]=useState(p)` / `O = D && (E ? !_ : y)`；
4 个文件直接 import 该组件、**8 处** 直接调用点（`sites-end-resource`×2、`agent-activity-item`×1、
`local-conversation-sources-side-panel-tab`×4、`mcp-tool-item-content`×1）**没有一处**传 `defaultExpanded`；
`defaultExpanded` 字面量只出现在 12 个 asset 里，与上述 4 个文件的交集只有 `sites-end-resource`，而那是 `xg` 的形参（不是本组件）；
`zh-CN-b05cfd55c534.js@1301169` 三条文案逐字为 `正在思考` / `已完成思考` / `已思考 {elapsed}`；
`app-primary-2b28b2369958.js@590717` 的 `XYe(e,{locale="en",underOneSecond="null",trimZeroUnits=false})` 与 `ReasoningBlock.formatElapsed` 逐分支一致；
`sites-end-resource` 的 `Fw`（流式起点 → 完成结算）与 `useReasoningElapsed` 口径一致。

### 5.5 ⚠️ 本轮新发现（**未裁决**，不在本次改动范围内）：官方 **exec 卡**在 running 时也不自动展开

把官方 exec 卡的专用渲染路径读全后，它与 §5.1 那条「running 自动展开」**并不一致**，先登记不下结论：

| 事实 | 出处（逐字） |
| --- | --- |
| exec 卡（`Kx` 分派：read / search / list_files 之外全走 `Jx`）的展开态**初值写死 `collapsed`**，且只由用户点击改变，**与 status 无关** | `sites-end-resource-ecc479065e0b.js` 的 `Jx`：`let [b,x] = useState("collapsed")`、`O = !h && b === "expanded"`、`P = () => { let e = O ? "collapsed" : "expanded"; … x(e) }`（原文这三处字符串字面量用反引号） |
| 它把 `{expanded: O, onToggle: P}` 直接交给块头骨架（`df` ← app-primary 的 `bh`），**没有**经过 `tool-activity-disclosure` 的状态机 | 同上：`f = h ? void 0 : {expanded:O,onToggle:P}` |
| 「流式展开、完成折叠」在官方只确证于**推理块** | 同文件 `Aw`：`y = c ? !!v && (s == null \|\| s === "resumed") : m`（原文 "resumed" 用反引号；`c = !item.completed`） |

⇒ 参考端 exec 卡的可观测行为应当是「**一直折叠，除非用户点开**」；我们的适配层给 exec 传
`defaultExpanded = status === "running"`，在 §5.1 的派生下落地成「流式展开、完成折叠」——**running 这一段与官方 exec 卡不同**。
本轮**没有动**它，理由：该契约被 `src/chat/runtime/selftest.mjs:774/780/800` 钉住（不在本目录写范围），
且参考端工具卡 **0 实测**（§5.3 / §5.4）。请 Lead 裁决：保留（记为**有意偏差**）还是把 exec 改成「恒折叠 + 用户点击」。

**已裁决（2026-10-11，`docs/RULINGS.md` R4）：向官方对齐** —— 紧接着就是落地记录（§5.7）；
§5.6（环境陷阱）排在它后面，是同一轮踩到的坑，顺序按「发现 → 落地 → 环境」读即可。

### 5.7 R4 落地：exec 卡改成「恒折叠 + 用户点击」（本轮实现 + 真机复测）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `src/chat/block-adapter.ts` | exec 分支**不再产出** `defaultExpanded`（旧值 `status === "running"` 删除）；terminal 分支同样不再产出 |
| `src/chat/blocks/Disclosure.tsx` | 新增**受控档**：传了 `expanded`/`onToggle` 就完全绕过 tool-activity-disclosure 状态机（`expanded = hasBody && (controlled ? expanded : machineExpanded)`）；不传则保持原状态机档 |
| `src/chat/blocks/ExecBlock.tsx` | 用受控档复刻官方 `Jx`：`useState(false)` 恒从 collapsed 起步、只有点击会翻转、**不看 status** |
| `src/chat/blocks/TerminalBlock.tsx` | 同上。理由：它渲染的**就是**同一张官方卡（`data-testid="exec-shell-body"`），而官方 `Kx` 把 read/search/list_files 之外的工具**全交给 `Jx`** ⇒ 通用工具卡在官方也走这条 |
| `src/chat/blocks/types.ts` | `ExecNode` / `TerminalNode` 删掉 `defaultExpanded` 字段（这个入口不存在了；留着就是等人再按 status 派生一次） |
| `src/chat/runtime/selftest.mjs` | `:774/:780/:800` 三条断言按 R4 改**期望值**（不是放宽）：旧期望编码的是「我们自己发明的」流式自动展开 |

**没有动**：推理块（官方 `Aw` 的 `y = c ? … : m`，流式展开/完成折叠保留）、SearchBlock（它对应官方的
read/search/list_files 那一支，那一支的展开语义**未确证**，保持原状）。

**真机复测**（自建 SSE 桩 + dist-exec 实机，CDP 9870；窗口守卫每 150ms 还原 + 采样点 rAF 92~98）

| 时刻 | exec 卡 | 推理块 |
| --- | --- | --- |
| 流式中 t≈1.4s | （尚未出现，tool_calls 6.0s 才到） | `正在思考` **aria-expanded=true**，正文 **33px** |
| running t≈7.1s | `正在运行` **aria-expanded=false**，正文 **0px**、`inert` | `已思考 5s` aria-expanded=false（正文开始前已收束） |
| 用户点击后 t≈8.1s | `正在运行` **aria-expanded=true**，正文 **126.41px** | 同上 |
| 再点一次 t≈9.3s | `正在运行` **aria-expanded=false**，正文 **0px** | 同上 |
| 流结束后 t≈20.6s | `已停止` **aria-expanded=false**，正文 0px（status 迁移不改用户的展开态） | `已思考 5s` aria-expanded=false |

10/10 PASS、0 FAIL、0 BLOCKED（探针 `C:\Temp\r4-probe.json`；截图 `tmp-shots/r4-01…05-*.png`）。
脚本在 %TEMP%（`r4-stub.mjs` / `r4-probe.mjs` / `r4-guard.ps1`），不进仓库。

### 5.6 环境陷阱（本轮踩到，下一轮别再花时间）：窗口被**最小化**时帧停摆

现象：探针里 `document.hasFocus()=true` 但 `visibilityState=hidden`，
`throttle` 的 React 状态更新迟迟不落地（探针只看到旧块）、`Page.captureScreenshot` 直接超时 15s+。
判据：页内 rAF 计数（400ms 内 **97–98** 帧 = 正常；**1–2** 帧 = 停摆）+ `IsIconic(hwnd)=true`。
恢复：`ShowWindow(hwnd, SW_RESTORE=9)` + `SetForegroundWindow`（`WScript.Shell.AppActivate` 单独用**不能**还原最小化窗口）。
本机多组并发时窗口会被反复最小化，跑量测要用「守卫脚本每 400ms 检查并还原」而不是一次性激活。

---

## 6. 参考端未实测清单（2026-10-11 · 猎捕组发现同步轮次）

> 依据来源：官方证据根 `C:\artex-ymh\evidence\codex-desktop`（`captures/**`、`reference-shots/**` 逐文件清点）
> 与官方解包 `…\codex-desktop-electron\app\webview\assets`。**本轮不新增采集**（原因见 §6.4）。
> 本节是**边界声明**：下列形态**参考端 0 采集** —— 实现可以存在，但**不得声称「与 Codex 一致」**。

### 6.1 四个 rail 页面族 = 参考端 **0 采集**

| 页面（本工程） | 路由 | 参考端采集 |
| --- | --- | --- |
| [`src/pages/ScheduledPage.tsx`](../../pages/ScheduledPage.tsx) | `/scheduled`、`/automations` | **无** |
| [`src/pages/PluginsPage.tsx`](../../pages/PluginsPage.tsx) | `/plugins`、`/skills` | **无** |
| [`src/pages/ExplorePage.tsx`](../../pages/ExplorePage.tsx) | `/explore`（官方是重定向回首页） | **无** |
| [`src/pages/ReviewPage.tsx`](../../pages/ReviewPage.tsx) | `/review`、`/pull-requests` | **无** |

**证据（可复算）**：`captures/` 现有采集只有 home / settings / conversation / chat-home / sidebar / 四张应用菜单 /
model-picker / permission-menu / topbar（`blocks-*.json`、`tree-*.json`、`views-*.json` 同族）——
**没有任何** `/scheduled` `/automations` `/plugins` `/skills` `/explore` `/review` `/pull-requests` 的页面采集。
「定时任务 / 插件 / 探索 / 代码审查」四个词在证据根里只出现在三处：`captures/tree-rail.json`（导轨图标清单）、
`captures/blocks-sidebar.json`（导轨文案聚合串）、`captures/blocks-settings.json` + `views-settings.json`（设置页文案 / 视图 dump 里的导轨）。
⇒ 这四页的**全部几何、空态、列表行、错误态**都无参考实测。

### 6.2 会话块：135 个节点里只有外壳形态被采到

`captures/blocks-conversation.json`（`count=135`、viewport 1280×816）逐串计数：
`exec-shell-body` / `read_file` / `reasoning` / `已思考` / `aria-expanded` / `data-testid` / `approval` / `plan` /
`search-block` / `diff` / `terminal` / `code-block` / `markdown` —— **全部 0 命中**；
只有 `section-toggle` ×6（artifact 浮层）、`summary-panel-item` ×7、`scroll-to-bottom` ×3。
（`captures/views-chat-conversation.json` 里 `terminal` 368 / `diff` 110 / `aria-expanded` 16 的命中，
逐条抽查**全是 CSS 变量名**（`--color-codex-terminal-*` / `--color-token-diff-surface` / `--diffs-line-height`）
或**应用菜单按钮**（`application-menu-trigger-*`），**不是渲染出来的块**。）

### 6.3 未实测形态清单（**不得声称与 Codex 一致**）

- **ExecBlock / TerminalBlock / AnsiText** —— 工具卡**折叠态、展开态、失败态全无**参考节点。
- **ReasoningBlock「已思考」chip** —— 参考端**该节点没采到数值**（`ref-08-conversation.png` 里看得到，DOM 采集里 0 命中）。
- **ApprovalBlock / PlanBlock / SearchBlock / ErrorBlock** —— 参考端 0 采集（本目录按 §3 的**推断**实现）。
- **DiffBlock / FileEditBlock / CodeBlockBlock / ActivityBlock** —— 同上。
- 以上各块的**空态 / 错误态 / 超长输出态**。
- 浅色主题：参考端只采了深色（§3 第 10 条）。
- 单条出处：[`docs/FIDELITY-AUDIT.md`](../../../docs/FIDELITY-AUDIT.md) #64 / #65 / #66 与
  [`docs/OPEN-ITEMS.md`](../../../docs/OPEN-ITEMS.md) §四。

### 6.4 为什么本轮不补采（**确实做不到**）

补这些形态需要**官方 App 的可控会话并触发真实工具调用**（受账号 / 宿主门控：参考端那一次采集就没触发到），
成本高且必须回到官方运行时；**我们这一侧的自证（§4 / §5 的 CDP 打桩）不算参考实测**。
⇒ 在拿到新的官方运行时采集之前，本清单每一项都保持「未实测」标注，**不写"已对齐"**。


