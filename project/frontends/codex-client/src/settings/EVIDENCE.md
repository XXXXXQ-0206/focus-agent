# W5 设置页与基础件 · 实测证据（cx-settings）

## 0.2 2026-10-15 第三轮：命名与分区整合（最新）

1. **「内网作战」全部改称「内网会话」**（用户要求）：客户端（命令面板项、连接页文案与注释）、
   服务端注释（server/intranet.go、server/server.go）、迁移前前端快照
   共 10 处；`rg 作战` 现在全仓 0 命中。
2. **「连接」「上游连接」「流量与证据」三页合并为『连接与流量』**（用户提议：三页是同一条链路的
   不同段落）。合并后一页六段：
   上游代理（`global_proxy`）→ 流量与证据（`traffic_capture` / `agent_traffic_binding`）
   → 脚本运行时（`python_interpreter` + 检测）→ 内网会话（`/api/sessions`）
   → 隧道（`/api/tunnels`，可拆除）→ 凭据（`/api/credentials`，脱敏）。
   旧深链 `/settings/artex-traffic`、`/settings/artex-connections` 重定向到新页（书签不失效）；
   `ArtexTrafficPane` / `ArtexConnectionsPane` 两个组件删除，共享的
   `useArtexSettings` / `Feedback` / `ReloadButton` 改为导出复用。
   合并后 ARTEX（服务端）组 = **连接与流量 / Agent 运行 / 网络搜索**。

## 0.1 2026-10-15 第二轮：把「还能做的」做出来（最新）

用户复核上一轮删除清单（「这些都做不了吗？有些还是很可以的吧」）后，本轮**恢复并做成真实功能**的三处：

| 项 | 现在是什么 | 真实性证据 |
| --- | --- | --- |
| 键盘快捷键 | 重写为**真绑定**：`commands.ts` 里 10 条命令（导航/界面/调试），每条都有 `run()`；`useCommandHost()` 挂在 AppShell，改键立即生效 | E2E：把「切换深色/浅色」改到 `Ctrl+Alt+T` → 在首页按下 → `documentElement.dataset.theme` 从 dark 变 light；`Ctrl+K` 打开搜索层、`Ctrl+/` 跳到本页；「全部重置」后 `localStorage.codex.commands` 被清空 |
| 浏览器 | 重做为 **Playwright MCP 控制页**（后端种入的 `browser` 服务器：启用开关 / 启动命令 `npx @playwright/mcp --headless` / 工具清单与刷新 / 抓包自动接代理的说明） | E2E：页面读到真实数据（enabled=false、命令与参数原样来自 `/api/mcp`） |
| 外观（部分） | 三行**真正接线**的开关搬进「常规 → 显示」：减少动态效果 / 字体平滑 / 使用指针光标（写 `:root[data-*]`，base.css 与 ui.css 消费） | 同上：切开关即写属性（原有实现，本轮只是把入口搬回来） |

**合并**（用户点名的做法）：
- **配置(agent) → 自定义 API**：新增「推理强度」（`reasoning_effort`，真实进请求体）＋「关于你（背景与偏好）」（追加进同一条 system 消息）＋「批准策略与沙盒」指路行（本客户端没有本机执行侧，真实审批在 ARTEX 审批页）。
  证据：`node src/api/selftest.mjs` 15/15 通过 —— 断言 `messages[0].content === "你是助手\n\n我是安全工程师"`、`body.reasoning_effort === "low"`，且留空时**两个字段都不出现在请求体**。
- **个性化 → 自定义 API**：自定义指令 = 系统提示词（已有）+ 关于你（新增）。
- **电脑操控 → 连接**：等价物是内网会话（远程机器上执行/读写），已在「连接」页 + 内网会话页。

**仍然删除**，并给出"为什么不能真做"（不是不想做）：
导入（没有账号域可导）· 语音（没有音频采集/STT 通道）· Mini 宠物（与产品无关）·
旧版连接-远程设备控制（需要账号域与配对通道）· 代码审查 / Git / Worktrees（需要仓库托管与推送执行侧）·
环境（官方是每项目的工作树脚本；本工程的等价物是 ARTEX 的 python 解释器与工作区设置，已在别处）·
钩子（没有生命周期宿主）。**差异标记**一行也没有恢复：全仓只有 store 与重置清单引用它，
没有任何 diff 视图消费，恢复就是摆假开关。

## 0. 2026-10-14 收敛（历史，仍有效）

设置面从「官方 18 项 + 6 项附加」收敛为 **9 项**，逐条理由写在 `nav-model.ts` 的分组注释里：

| 保留 | 说明 |
| --- | --- |
| 常规 | 用户点名的 8 行：发送快捷键 / 跟进·排队方式 / 完成与通知 / 默认打开位置 / 界面字号 + 代码字号 / 密度 / 主题 / 圆角。**每一行都接在真实开关上**（`sections/GeneralSection.tsx` 头注释逐行给出落点） |
| 归档 | 重做为 **ARTEX 任务归档**（`/api/task-archives`：查看 / 恢复 / 删除，状态机见 `panes/archived.tsx`） |
| 插件 | 重做为 **ARTEX MCP 服务器**管理（`/api/mcp`：添加 / 编辑 / 启停 / 刷新工具 / 删除） |
| 连接 | 新增：**内网会话 + 隧道 + 凭据**（`/api/sessions`、`/api/tunnels`、`/api/credentials`）＋ 内网会话页入口（⚠️ 2026-10-15 第三轮已与「上游连接」「流量与证据」合并为『连接与流量』，见 §0.2） |
| ARTEX（服务端） | 流量与证据 / Agent 运行 / **上游连接**（原「连接」，避免与上面重名）/ 网络搜索（⚠️ 同上：前三项已合并） |
| 还原工程（附加） | 控件库 / 自定义 API（「关于」仍只留深链） |

**删除**（共 16 个文件）：导入、语音、配置(agent)、个性化、Mini 与虚拟宠物、电脑操控、浏览器、
钩子、旧版连接、代码审查、Git、环境、Worktrees（14 个 pane）+ 外观、键盘快捷键（2 个 section）。
其中「外观」里真实生效的四行（字号 / 密度 / 圆角 / 主题）**并入常规**；其余行没有承接页面。
搜索面板（Ctrl+K）的设置条目改为**从 `nav-model` 派生**，不再有指向已删分区的死链接。

验收证据（真机，dev 3002 + 嵌入 8787）：归档走了一遍
`任务页「归档任务」→ worker 归档 → 设置·归档出现「已归档 · 5.1 KB → 1.8 KB」→ 点「恢复」→ 行离开列表`；
插件走了一遍 `添加 smoke-mcp → 列表出现 → 删除`；两页的错误态（重复名称、未配 LLM）都原样显示。

> 本文件是 task-5 的验收材料：每条数值都能复算。
> 复算方式见 §1，对照表见 §2，键盘可达性见 §3，设置项真实生效见 §4，已知缺口见 §5。

## 1. 怎么复算

```powershell
cd C:\Users\熊骞\Desktop\artex\codex-desktop-src
npm run dev                      # 记下端口（本机 5273 被占时是 5274）

# 起一个带远程调试的 Chromium（Edge 即可，headless 也行）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --remote-debugging-port=9333 `
  --user-data-dir="$env:TEMP\cx-settings-edge" --window-size=1280,816 about:blank

# 定尺 1280×816 量测（零依赖 CDP 客户端，输出 JSON）
node src/settings/dev-measure.mjs --port 9333 `
  --url http://127.0.0.1:5274/src/settings/dev-preview.html --section shortcuts `
  --out C:\artex-ymh\evidence\w5-settings-measure.json
```

- 自测台页面：`src/settings/dev-preview.html`（`?section=general|appearance|shortcuts|about`）。
  它按 SPEC §3 的实测几何搭了最小外壳：导轨 52 + 面板 288（[52,44]，圆角 12px 0 0 12px）
  + 面板头 90 + 滚动区顶 y=134 + 主内容面 [340,44 936×768]（bg rgb(24,24,24)，
  radius 0 12px 4px 0）+ 视口顶 y=96。
- 弹层/控件实验室在页面左下（id 前缀 `lab-`），由脚本真实点击/悬停后量测。

## 2. 对照表（SPEC §3/§9 与交办实测 vs 本实现实测）

| 项 | 依据 | 目标值 | 实测值 | 结论 |
| --- | --- | --- | --- | --- |
| 设置内容列 | 交办实测（参考端 x=439） | 728 居中于 x=439 | `x=439 w=728`，`clientWidth=926 / offsetWidth=936` | ✅ 滚动条占 10px，与参考端一致 |
| 内容列（无滚动时） | 同上 | — | `x=444 w=728`（无滚动条时不占 10px） | ✅ 可解释 |
| h1 | 交办实测 | 28px / 500 | `28px / 500 / 36px` | ✅ |
| 分区标题 | 交办实测 | 14px / 500 | `14px / 500 / 21px`（含分组标题） | ✅ |
| 设置卡片 | 交办实测 + dsh-codex-ui 互证(`--sp-card:#232323`) | bg rgb(35,35,35) / 20px / 无边框无阴影 / padding 16px | `rgb(35,35,35)` `20px` `border-width 0px` `box-shadow none` `padding 16px` | ✅ |
| 设置行高 | `--height-token-settings-row`（官方 shell-shared:2946，用在 `.min-h-[var(--height-token-settings-row)]` shell-shared:10136） | 64px | `min-height 64px`，实测行高集合 `[64, 84]`（84 是 block 行，含滑杆） | ✅ |
| 行标签 | 交办实测 | 13px / 500 / 18 | `13px / 500 / 18px` rgb(223,223,223) | ✅ |
| 行说明 | 交办实测 | 12px / 430 / 16 · 白 65% | `12px / 430 / 16px`，color `color(srgb .87451 .87451 .87451 / .65)` | ✅ |
| 侧栏搜索框 | 交办实测 | 36 高药丸 | `[68,138] 256×36`，`border-radius 9999px` | ✅ y=138 = 134+4 |
| 侧栏首个条目 | 交办实测 | y=178 | `[68,178] 256×30` | ✅ 138+36+4 |
| 侧栏条目 | 交办实测 | 30 高 / 圆角 12.5 / 14·400 / 选中底 rgba(255,255,255,.08) / 步进 31 | `30px` `12.5px` `14px/400/21px` 选中 `rgba(255,255,255,0.08)` 步进 `31px` | ✅ |
| Kbd | 官方 ShortcutKeys（app-shared JS）+ 交办 | 16 高 / 圆角 10 / 白 10% / 12px·430 / 行高 12 / padding 2px 6px | `h=16` `radius 10px` `bg currentColor 10%` `12px/430` `line-height 12px` `padding 2px 6px`（Ctrl+C 宽 46.22，参考端 48 — 字体度量差异） | ✅（宽度见 §5） |
| Dialog | SPEC §9 + 交办 | 半径 15px / 内边距 20px / min 250 / max 450 / 遮罩 #00000080 / `--cubic-enter` | `radius 15px` `padding 20px` `min-width 250px` `max-width 450px` 遮罩 `rgba(0,0,0,0.5)` + `blur(1px)`，`corner-shape superellipse(1.5)` | ✅ |
| 菜单容器 | SPEC §9 | 半径 20 / 底 rgb(45,45,45) / blur(16px) / `--menu-box-shadow` / gutter 4 | `radius 20px` `rgb(45,45,45)` `blur(16px)` `0 0 0 .5px rgba(255,255,255,.082), 0 8px 16px -4px rgba(0,0,0,.12)` `padding 4px` 最小宽 220 | ✅ |
| 菜单条目 | SPEC §9 + 交办 | 半径 15 / padding 5px 8px | `radius 15px` `padding 5px 8px`，条目 212×28.56（min-height 28） | ✅ |
| 菜单分隔线 | SPEC §5 | 满宽 ×1px，上下 8px 外边距，色 rgba(255,255,255,.157) | `196×1`，`border-width 0`，margin 4px 8px（`--menu-separator-gutter` Electron 档 = `4px 8px`，官方 shell-shared:3977） | ✅（应用菜单内另有 my-2 覆盖） |
| Tooltip | SPEC §9 | 圆角 10 / 底 rgba(54,54,54,.96) / 14px / padding 12px 16px / 三叠加阴影 / max 300 | `radius 10px` `rgba(54,54,54,0.96)` `14px/400` `padding 12px 16px` `max-width 300px` `0 10px 15px -3px + 0 4px 6px -4px + 0 0 0 .5px`，行高 20.3 = 14×1.45 | ✅ |
| Switch | 官方 token | 32×19，滑块内缩 3px | `32×19`，勾选底 `rgb(51,156,255)`（--switch-track-color-checked） | ✅ |
| Checkbox | 官方 token | 16 边长 | `16×16`，选中底 rgb(223,223,223)（--color-background-primary-solid） | ✅ |
| Select / Textarea | 官方 token | 高度/圆角/字号来自 `--input-*`；textarea radius `--control-radius-md`=10 | select `120×24` radius 7.5px；textarea radius 10px / 14px | ✅ |
| 动效 | SPEC §10 | 进场 `--cubic-enter`，退场 `--cubic-exit`；遮罩 .6s / 内容 .6s / 退场 .3s | `animation: cx-dialog-in var(--modal-enter-duration, .6s) var(--cubic-enter)`；`:root[data-reduced-motion="true"]` 下全部 `animation: none` | ✅（token 不在本仓库 tokens.css，已加 .6s/.3s 回退，见 §5） |

### 2.1 真实外壳复测（`/settings/general`、`/settings/shortcuts`，1280×816）

Lead 接线后（`src/shell/routes.tsx` → `SettingsPage`），在**真实应用**里复测（`--url http://127.0.0.1:<port>/settings/...`）：

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 内容有滚动条时（shortcuts） | 滚动容器 `[341,44 935×768]`、`clientWidth 925`；列 `x=439.5 w=728` | ✅ 与参考端 439 差 0.5px（外壳主内容面 x=341 vs 参考 340，不是设置页的问题） |
| 内容无滚动条时（general） | 列 `x=444.5 w=728` | ✅ 无滚动条时右移 5px，符合"滚动条占 10px"的推导 |
| 卡片 / 行 / 标签 / 说明 | `rgb(35,35,35)` / 20px / 16px / none；行高 `[64, 84]`；标签 `13/500/18`；说明 `12/430/16 · 65%` | ✅ 与自测台逐值一致 |

## 3. 键盘可达性自测（CDP 真实按键，非合成事件）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 焦点锁 | 打开对话框后连按 4 次 Tab，记录 activeElement | 4/4 全部落在 `.cx-dialog__content` 内 ✅ |
| Esc 关闭 | `Input.dispatchKeyEvent` Escape | 对话框与遮罩都消失 ✅ |
| 焦点归还 | Esc 后读 activeElement | `lab-dialog-trigger`（打开它的按钮）✅ |
| 菜单关闭 | 打开下拉菜单后 Esc | 关闭，activeElement = `lab-menu-trigger` ✅ |
| 聚焦不改几何 | 聚焦导航搜索框前后比 rect | 完全一致 ✅（借 dsh-codex-ui 的验证方法论） |
| 稳定后不写 DOM | MutationObserver 观察 1s | `domMutationsIn1s: 0` ✅ |

## 4. 设置项真的生效（真实点击验证）

| 设置 | 操作 | 观测 | 结果 |
| --- | --- | --- | --- |
| 主题 | 点「浅色」单选 | `<html data-theme>` dark→light，`--color-surface` `#181818`→`#fff` | ✅ |
| 减少动效 | 点「减少动效」开关 | `<html data-reduced-motion>` false→true | ✅ |
| 持久化 | 同上 | `localStorage.codex.settings` = `{"fontScale":"default","density":"comfortable","reducedMotion":true,...}` | ✅ |
| 字号 / 行距密度 / 代码字号 / 圆角 | 改档位 | 写官方同款 inline 变量，**成对写 `<html>` 与 `<body>`**（对齐官方 `ac(e11,s12); ac(t11,s12)`，app-initial-25361a10f2bf.js；实现见 store.ts:245-271）：--font-ui-size / --text-* / --height-token-settings-row / --font-code-size / --corner-radius-scale；选回默认档会**在两个宿主上**删除这些 inline 变量 | ✅（默认档 0 覆盖，交还官方 CSS） |
| 快捷键 | 点「开始录制」 | 全局捕获 keydown，命中 SPEC §4 §5 的官方键位并高亮对应行 | ✅ |

## 5. 已知缺口与风险（如实列出）

1. **设置页尚未接线**：`src/shell/routes.tsx` 的 `SettingsRoute` / `SettingsSectionRoute` 仍是占位 div（Lead 独占），
   所以 `vite build` 产物里暂时不包含本模块。已请 lead 接线；`@/settings` 的出口见 `index.ts`。
2. **弹层半径口径冲突**：SPEC §9 写 `--dialog-radius` / `--modal-radius` / `--popover-radius` = 20px，
   而 `src/styles/theme.css`（cx-styles）把三者钉成 `calc(.75rem*1.25)` = **15px**（= `--radius-xl` ×1.25），
   交办书也要求 dialog = 15px。本实现**只用 token 不写死**，token 改两处都自动跟随；请 lead 裁定最终口径。
3. **`--modal-enter-duration` / `--modal-exit-duration` 不在本仓库 token 层**（官方在 shell-initial:4787/4788）：
   组件里已加 `.6s` / `.3s` 回退，行为与 SPEC §10 一致；若 cx-styles 后续补进 token 层则自动改用 token。
4. **tooltip / hover-card 无官方实测几何**（SPEC §15 缺口 3）：tooltip 全部按 token；hover-card 借 popover 同档。
5. **toast 未触发过**：只按 SPEC §9 的容器 DOM 几何（fixed inset:0 / pointer-events:none / padding 8px）与 --menu-* 表面实现。
6. **Kbd 宽度 46.2 vs 参考端 48**：字体度量差异（参考端 -apple-system/Segoe UI 渲染），
   高度/圆角/内距/字号/行高逐项一致，宽度不写死。
7. **菜单条目字号**：通用下拉/右键菜单用 `--menu-font-size`（Electron 档 = `--text-sm` = 13px）；
   应用菜单（menubar）按 SPEC §5 覆盖为 **12px/18px**、条目 28 高、padding 5px 16px，两者不要混用。
8. **设置导航首个条目的 y=178 依赖"第一组不渲染分组标题"**：138（滚动区顶+padding）+ 36（搜索框）+ 4（gap）= 178。
   若后续给第一组加标题，首条目会下移到 200 —— 要改就同步改这条。

## 6. 几何收口实测（2026-10-10 设置组；行高 / 下拉按钮 / 滚动容器）

**被测产物**：`dist-set2`（junction `C:\temp\cxset2`；CSS `index-4TiOPWby.css` 368 306 B @22:37:19，sha256 前缀 `4A45743DAA5D16A8`），
Electron 实机 CDP 9842、profile `C:\temp\cxset2m`、1280×816 @dpr1.5，守卫 `hasFocus=true` / `visibilityState=visible`。

| 项 | 官方真值（证据） | 改前（同一构建注入旧值复现） | 本轮实测 |
| --- | --- | --- | --- |
| 行高（常规页 25 行） | **60.5625×22 / 92.5625×1 / 44×1 / 76.5625×1**（`captures/blocks-settings.json` blocks[175] 及其同类行，逐块） | 61×22 / 93 / 44 / 77 | **60.5625×22 / 92.5625 / 44 / 76.5625** —— 逐值相等 |
| 行标签块 | **18.5625**，computed `18.5714px` = 13px × calc(1.25/.875)（blocks[178]；shell-shared.css:1009,2809） | 19（`line-height:19px`） | **18.5625**，computed `18.5714px` |
| 设置列 | 419.333,166.667 **768×2069.5**（blocks[140]） | 2080 | **2069.5** |
| 滚动容器 | 935.333×722、padding 0，两个子节点 = `_shell_bomwa_2` **76.6667** + `group/settings` **2069.5**（blocks[134][135][140]）⇒ 内容 2146.1667 → scrollHeight **2146** | 2157 | **2146**（子节点同 76.6667 + 2069.5） |
| 下拉触发按钮 | **116×28**、gap **4px**、border **0.666667px solid rgba(255,255,255,.082)**、padding 0 12px（blocks[181]）；label span 72.6667 = 18(icon-sm)+6(gap-1.5)+48.6667(文字)（blocks[182]） | 92.6667×28、gap 6px、border 0 | **92×28**、gap **4px**、border **0.666667px solid rgba(255,255,255,.082)**；label span 48.6667×18、chevron 14×14 |

* **92 = 116 − 24**：官方按钮左侧那 24px = 宿主下发的 `<img class="icon-sm">`（18px）+ span 内 `gap-1.5`（6px）。
  官方图标目录里**没有**该资产（F1 结论），**禁止**用近似图形冒充 ⇒ 我们这边本就不该有这 24px；
  两边 chevron 左边缘重合（x=1124），文字宽度两边同为 **48.6667**。
* **scrollHeight 的「+37」是参考值错误，不是结构差 —— 本轮判定「不改」**：
  1. 官方滚动容器 `div.flex-1.scrollbar-stable.overflow-y-auto`（blocks[134]）**就**把标题带外壳与内容列都放在里面
     （两个子节点 76.6667 + 2069.5，padding 0）⇒ 内容 2146.1667，Chromium 取整 **2146**；与本工程
     `.cx-settings__scroll ▸ .cx-settings__shell + .cx-settings__page` 结构**一致**。
  2. 被当成官方值的 **2109.5 在官方证据根 E 的 108 个文件里 0 命中**；它 = 2069.5 + 40，把 2069.5 **自身已含**的
     20px+20px 内距又加了一遍（该元素自身的 scroll 指标是 `scrollHeight:2070 / clientHeight:2070`，
     见 `captures/views-settings.json` 的 `div.group/settings` 条目）。审计 #108 的写法（"2069.5 + padding"）就是这次重复计入。
  3. 改前 2157 = 2146.1667 + 10.5（行高残差）；10.5 随行高修复消失，**无其他残差**。
* **逐页抽查（20 个分区，全量而非抽样）**：13px/500 标签 computed 行高恒为 `18.5714px`；
  `font-size:13px && line-height:19px` 的元素 **0 个**；行高恰为 19px 的元素 **0 个**；
  行高只出现 60.5625 及其内容倍数（+16/+32/+48…）。逐页截图 40 张（每页 top+bottom，临时目录 `%TEMP%\set2-shots\`，未入仓）。

**复跑口令**（零改动，可原样执行）：
```powershell
cd C:\Users\熊骞\Desktop\artex\codex-desktop-src
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
New-Item -ItemType Junction -Path C:\temp\cxset2 -Target (Join-Path (Get-Location) 'dist-set2')
$env:CODEX_ELECTRON_USER_DATA_PATH = 'C:\temp\cxset2m'
$env:CODEX_DESKTOP_WEBVIEW_DIR = 'C:\temp\cxset2'
npx vite build --outDir dist-set2
Start-Process .\node_modules\electron\dist\electron.exe -ArgumentList @('electron/dist/main.js','--remote-debugging-port=9842','--user-data-dir=C:\temp\cxset2m','--disable-features=CalculateNativeWinOcclusion')
node tools/cdp-eval.mjs 9842 "JSON.stringify({focus:document.hasFocus(),vis:document.visibilityState,iw:innerWidth,ih:innerHeight})"
```

