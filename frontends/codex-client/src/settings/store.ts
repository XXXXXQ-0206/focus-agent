import { useSyncExternalStore } from "react";

/**
 * 设置项状态：本模块是**唯一写入口**，且所有改动都真的落到 DOM 上。
 *
 * 为什么不用 Context：本工程的 App.tsx（Lead 独占）没有包设置 Provider，
 * 而设置项要在任意路由下都生效（例如主题、字号）。所以这里做成模块级外部 store +
 * useSyncExternalStore —— 无 Provider 也能用，且快照引用稳定。
 *
 * 字段分三块：
 *   A. **官方「常规」页 25 行**（docs/SPEC-SETTINGS.md §4.1，逐行编号 1~25）——
 *      默认值就是参考端实测的「当前值」，每一行都在注释里标了 SPEC 行号。
 *   B. **官方「外观」页**（SPEC §4.2.2，代码取证）—— 无实测取值，默认值是工程保守值。
 *   C. **本还原工程附加档位**（官方 25 行里**没有**这些行，SPEC §6 对账表已列）：
 *      字号档 / 行距密度 / 代码字号 / 圆角倍率。它们放在「外观 → 附加」里，不冒充官方项。
 *
 * 生效方式对齐官方：官方把一批字号/密度变量用 JS 注入 inline style，而且**成对写 `<html>` 与 `<body>`**
 * （app-initial-25361a10f2bf.js 里 `ac(e11, s12); ac(t11, s12)`，e11=documentElement、t11=body ——
 * 出处与逐条清单见 applySettings 上方的「两个宿主」注释）。这里同样只写 inline style，
 * 并且「默认档一个变量都不写」（两个宿主都 removeProperty），让官方 token 自己生效。
 */

export type FontScale = "compact" | "default" | "comfortable";
export type SettingsDensity = "comfortable" | "compact";
export type CornerScale = "standard" | "compact";

/**
 * 「默认打开位置」（官方行 4「默认文件打开位置」）—— 2026-10-14 重定义为**本工程能真做的两种**。
 *
 * 官方那组取值是「用哪个编辑器打开」（VS Code / Cursor / Zed …），本工程是纯 Web 客户端，
 * 没有拉起本机编辑器的通道（Electron 外壳也没有 os.open 桥），所以照用户口径
 * （能做就做、做不了就换）改成工作区文件的两种默认动作，并在工作区页真实生效：
 *   preview  → 应用内预览（预览弹窗，toolkit-pages 的 FilePreview）
 *   download → 下载到本机（/api/workspace/download）
 */
export type OpenTarget = "preview" | "download";
/** SPEC §4.1 行 5「集成终端 Shell」 */
export type TerminalShell = "powershell" | "cmd" | "git-bash" | "wsl";
/** SPEC §4.1 行 6「语言」（官方枚举含 settings.ide.language.auto） */
export type AppLanguage = "auto" | "zh-CN" | "en";
/** SPEC §4.1 行 7「关闭窗口前确认」 */
export type ConfirmBeforeClose = "keyboardOnly" | "always" | "never";
/** SPEC §4.1 行 16「发送快捷键」 */
export type EnterBehavior = "enter" | "modifier-enter";
/** SPEC §4.1 行 17「跟进处理方式」：排队 / 引导 */
export type FollowUpMode = "queue" | "steer";
/** SPEC §4.1 行 20「轮次完成通知」 */
export type TurnCompleteNotification = "unfocused" | "always" | "never";
/** SPEC §4.1 行 24「通知提示音」 */
export type NotificationSound = "default" | "none";
/** SPEC §4.2.2「差异标记」：颜色 / +− 标记 */
export type DiffMarkerStyle = "color" | "sign";

export interface CodexSettings {
  /* ── A. 官方「常规」页（SPEC §4.1 行 1~25）──────────────────────────────── */

  /** 1 · 默认权限（实测：开） */
  permissionsDefault: boolean;
  /** 2 · 完整访问权限（实测：开；官方另有确认弹窗 …fullAccess.confirm.title） */
  permissionsFullAccess: boolean;
  /** 3 · 无项目任务文件夹（实测值即本机路径；官方按宿主 home 生成 —— 未实测） */
  projectlessChatFolder: string;
  /** 4 · 默认文件打开位置（实测：VS Code） */
  defaultOpenTarget: OpenTarget;
  /** 5 · 集成终端 Shell（实测：PowerShell） */
  integratedTerminalShell: TerminalShell;
  /** 6 · 语言（实测：自动检测） */
  language: AppLanguage;
  /** 7 · 关闭窗口前确认（实测：仅在使用“关闭”快捷键时） */
  confirmBeforeClose: ConfirmBeforeClose;
  /** 8 · 默认采用完整视图（实测：关） */
  defaultWorkspaceFullView: boolean;
  /** 9 · 底部面板（实测：关） */
  bottomPanel: boolean;
  /** 10 · 压缩本地保存的聊天历史记录（实测：关；官方说明“重启后生效”） */
  compressChatHistory: boolean;
  /** 11 · 提示词建议（实测：开） */
  ambientSuggestions: boolean;
  /** 13 · 插件（实测：开） */
  pluginsEnabled: boolean;
  /** 14 · 纯文本编辑器（实测：关） */
  plainTextEditor: boolean;
  /** 15 · 显示上下文窗口使用情况（实测：关，且**无说明文案** → 行高 44） */
  contextUsageIndicator: boolean;
  /** 16 · 发送快捷键（实测：按 Enter 键） */
  enterBehavior: EnterBehavior;
  /** 17 · 跟进处理方式（实测：引导） */
  followUpMode: FollowUpMode;
  /** 18 · 弹出窗口快捷键（实测：未分配 → 空串） */
  popoutHotkey: string;
  /** 19 · 默认使用独立聊天（实测：关） */
  popoutProjectlessDefault: boolean;
  /** 20 · 轮次完成通知（实测：仅在未聚焦时；官方消息 id 未解析，SPEC §8.3） */
  turnCompleteNotification: TurnCompleteNotification;
  /** 21 · 启用权限通知（实测：开；官方消息 id 未解析） */
  notifyPermissions: boolean;
  /** 22 · 启用问题通知（实测：开；官方消息 id 未解析） */
  notifyQuestions: boolean;
  /** 23 · 启用 dot 通知（实测：开；官方消息 id 未解析） */
  notifyDot: boolean;
  /** 24 · 通知提示音（实测：默认；官方消息 id 未解析） */
  notificationSound: NotificationSound;
  /** 25 · 彩纸礼炮（实测：关） */
  confetti: boolean;

  /* ── B. 官方「外观」页（SPEC §4.2.2，代码取证；取值为工程合理值，官方未实测）── */

  /** 差异标记：使用颜色或 +/− 标记显示更改 */
  diffMarkerStyle: DiffMarkerStyle;
  /** Dock 图标（官方行；macOS 专属，Windows 下不适用） */
  dockIcon: boolean;
  /** 字体平滑：使用 macOS 原生字体抗锯齿 */
  fontSmoothing: boolean;
  /** 减少动态效果：减少动画效果或匹配系统设置（官方在**外观**页，不在常规页） */
  reducedMotion: boolean;
  /** 使用指针光标：悬停交互元素时切换为指针光标 */
  usePointerCursors: boolean;
  /** 智能标点：输入时自动设置引号/破折号/省略号等格式 */
  smartPunctuation: boolean;

  /* ── C. 本还原工程附加档位（官方没有这些行）────────────────────────────── */

  /** 界面字号档（默认档 = 官方注入值，不写 inline） */
  fontScale: FontScale;
  /**
   * 行距密度档（写 --height-token-settings-row；官方 4rem，shell-shared:2946）。
   * ⚠️ SPEC §7.1：该 token 属另一套（ChatGPT 网页侧）设置行，
   * **不是** Codex 桌面「常规」页行高的来源（真值 60.5625 / 44 / 76.5625 / 92.5625；SPEC 原记的
   * 61 / 44 / 77 / 93 是 E2 采集器整数取整，更正见 docs/FORENSICS-F1-F2-F3.md「F2 收口」）——
   * 设置行已改成内容自适应，
   * 这个档位只影响仍在使用该 token 的列表/对话行。
   */
  density: SettingsDensity;
  /**
   * 代码字号 px。默认 **13px** = 元件**实际生效**值：官方 electron 窗口档在 **body** 上声明
   * `--font-code-size: var(--text-sm)`（官方 CSS app-shared-f2d570e85ceb.css 字节 1231225；
   * 本工程对应 styles/theme.css §3.7），参考端实测 **html=12px / body=13px**
   * （captures/tokens.runtime.json:1583-1586）。
   * ⚠️ 官方 `<html style>` 注入的是 `--font-code-size: 12px`（SPEC §2.2 / tokens.runtime.json:1457）
   * —— 那一档在 body 子树上被上面那条 CSS 遮蔽，所以**不作为本设置项的默认值**（Lead 裁决 #4：
   * 默认值对齐实际生效值，消除「UI 显示 12 而渲染 13」的自相矛盾）。
   */
  codeFontSize: number;
  /**
   * 界面字号 px —— 官方外观页**第 7 行「界面字号」**的数值（aria「无衬线字体大小」，
   * 官方 task-88 读数：input **64×28 @1065.1,654.3** + 「px」、行容器 440,638 726.7×60.6）。
   * 默认 **14** = 官方注入值 `--font-ui-size: 14px`（SPEC §2.2 / reset-contract.mjs 头注释实机读数）。
   * 写 `--font-ui-size`（受管 9 变量之一）—— **不新增变量**，
   * 所以 st.reset.clears-inline 的「9 个受管变量」判据不变。
   */
  sansFontSize: number;
  /** 圆角倍率档（标准 = 官方 @supports 下的 1.25；紧凑 = 1，即关闭超椭圆放大） */
  cornerScale: CornerScale;
}

/** SPEC §4.1 行 3 实测值（参考端与本工程同一台机器：C:\Users\熊骞\Documents\Codex） */
export const DEFAULT_PROJECTLESS_CHAT_FOLDER = "C:\\Users\\熊骞\\Documents\\Codex";

export const DEFAULT_SETTINGS: CodexSettings = {
  /* 官方「常规」页：默认 = 参考端实测当前值（SPEC §4.1「当前值」列） */
  permissionsDefault: true,
  permissionsFullAccess: true,
  projectlessChatFolder: DEFAULT_PROJECTLESS_CHAT_FOLDER,
  defaultOpenTarget: "preview",
  integratedTerminalShell: "powershell",
  language: "auto",
  confirmBeforeClose: "keyboardOnly",
  defaultWorkspaceFullView: false,
  bottomPanel: false,
  compressChatHistory: false,
  ambientSuggestions: true,
  pluginsEnabled: true,
  plainTextEditor: false,
  contextUsageIndicator: false,
  enterBehavior: "enter",
  followUpMode: "steer",
  popoutHotkey: "",
  popoutProjectlessDefault: false,
  turnCompleteNotification: "unfocused",
  notifyPermissions: true,
  notifyQuestions: true,
  notifyDot: true,
  notificationSound: "default",
  confetti: false,

  /* 官方「外观」页：无实测取值（SPEC §8.1/§8.2），取保守默认 */
  diffMarkerStyle: "color",
  dockIcon: true,
  fontSmoothing: true,
  reducedMotion: false,
  usePointerCursors: true,
  smartPunctuation: true,

  /* 附加档位 */
  fontScale: "default",
  density: "comfortable",
  codeFontSize: 13,
  sansFontSize: 14,
  cornerScale: "standard",
};

const STORAGE_KEY = "codex.settings";

/**
 * 字号档位表。default 一列是官方 <html style> 实测注入值（SPEC §2.2）：
 *   --font-ui-size: 14px; --text-xs: 12px; --text-sm: 13px; --text-base: 14px; --text-lg: 16px; --text-xl: 28px
 * compact / comfortable 是在这组值上按 ±1px 派生的档位（官方未采到这两档）。
 */
const FONT_SCALE_VARS: Record<FontScale, Record<string, string> | null> = {
  compact: {
    "--font-ui-size": "13px",
    "--text-xs": "11px",
    "--text-sm": "12px",
    "--text-base": "13px",
    "--text-lg": "15px",
    "--text-xl": "26px",
  },
  default: null,
  comfortable: {
    "--font-ui-size": "15px",
    "--text-xs": "13px",
    "--text-sm": "14px",
    "--text-base": "15px",
    "--text-lg": "17px",
    "--text-xl": "30px",
  },
};

/** 密度档：comfortable = 官方 4rem；compact 派生为 3.25rem（4rem − 12px） */
const DENSITY_VARS: Record<SettingsDensity, Record<string, string> | null> = {
  comfortable: null,
  compact: { "--height-token-settings-row": "3.25rem" },
};

/** 设置页读它作为行高；默认落到官方 token 上（⚠️ 设置行本身已改为内容自适应） */
export const SETTINGS_ROW_HEIGHT_VAR = "--height-token-settings-row";

let state: CodexSettings = load();
const listeners = new Set<() => void>();

function load(): CodexSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CodexSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setVar(el: HTMLElement | null, name: string, value: string | null) {
  if (!el) return;
  if (value === null) el.style.removeProperty(name);
  else el.style.setProperty(name, value);
}

/**
 * 受管 inline 变量写到**哪两个宿主**：`<html>` 与 `<body>`。
 *
 * 官方证据（app-initial-25361a10f2bf.js，官方发行包 app/webview/assets）：
 *   `let e11 = document.documentElement, t11 = document.body,
 *        n11 = { "--font-code-size": <m10> + "px" };
 *    ac(e11, n11);
 *    { … let s12 = { "--font-ui-size": …, …SOs… }; ac(e11, s12), ac(t11, s12) … }`
 *   · 成对写的是**整份字号表** s12：`--font-ui-size` + 字体族 + 同文件顶部 SOs 表
 *     （`--text-4xl/3xl/2xl/xl/lg/base/sm/xs`、`--text-heading-lg/app/md/sm`）；
 *   · 含 `--font-code-size` 的 n11 官方**只写 `<html>`**。
 *
 * 本工程为什么连 `--font-code-size` 也写 `<body>`：官方 CSS 的 electron 窗口档
 *   `:is([data-codex-window-type=browser],[…chrome-extension],[…electron]) body { …
 *    --font-code-size: var(--text-sm); … }`
 * （官方原文 app-shared-f2d570e85ceb.css 字节 1231225；本工程对应 styles/theme.css §3.7）
 * 是**声明在 body 上**的，只写 `<html>` 会被它遮蔽 —— 参考端实测 html 12px / body 13px
 * （captures/tokens.runtime.json:1583-1586）。「设置 → 外观 → 代码字号」要真的生效，
 * 用户选的值就必须落到 body（inline 压过该条规则）；默认档不写 inline，body 由官方 CSS 给 13px。
 *
 * ⚠️ 清档位（选回默认档 / resetSettings）走同一条路径：value=null → 两个宿主各自
 * removeProperty，不会留下半份 inline（行为用例 st.reset.clears-inline 的判据）。
 */
function writeTargets(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return [document.documentElement, document.body].filter((el): el is HTMLElement => el !== null);
}

/** 把设置真正落到 DOM：字号/密度/代码字号**成对**写 `<html>`+`<body>` 的 inline 变量，动效与光标走 data 属性 */
export function applySettings(next: CodexSettings = state) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const managed = [
    "--font-ui-size",
    "--text-xs",
    "--text-sm",
    "--text-base",
    "--text-lg",
    "--text-xl",
    "--font-code-size",
    "--height-token-settings-row",
    "--corner-radius-scale",
  ];

  const fontVars = FONT_SCALE_VARS[next.fontScale];
  const densityVars = DENSITY_VARS[next.density];

  // 先算「每个受管变量该是什么值」，再对两个宿主各写一次 —— 两侧永远同值、同时清。
  const values = new Map<string, string | null>();
  for (const name of managed) {
    values.set(name, fontVars?.[name] ?? densityVars?.[name] ?? null);
  }

  if (next.codeFontSize !== DEFAULT_SETTINGS.codeFontSize) {
    values.set("--font-code-size", `${next.codeFontSize}px`);
  }

  /* 界面字号（官方第 7 行）：非默认档才写 inline —— 与「默认档一个 inline 变量都不写」同一口径
     （默认 14px 由官方注入值给，见 theme.css）。
     ⚠️ 与上面的 fontScale 档**共写同一个变量** `--font-ui-size`：这里放在 fontVars 之后 ⇒
        两者都非默认时以**数值**为准（fontScale 的其余 5 个 --text-* 变量不受影响）。
        这是「官方数值行」与「本工程附加三档」共存的已知代价；不改 fontScale 的档位语义
        （behave st.font.* 仍按 13px 档断言）。 */
  if (next.sansFontSize !== DEFAULT_SETTINGS.sansFontSize) {
    values.set("--font-ui-size", `${next.sansFontSize}px`);
  }

  if (next.cornerScale !== DEFAULT_SETTINGS.cornerScale) {
    values.set("--corner-radius-scale", "1");
  }

  for (const target of writeTargets()) {
    for (const [name, value] of values) setVar(target, name, value);
  }

  root.dataset.reducedMotion = String(next.reducedMotion);
  // 「使用指针光标」：settings.css 里读这个属性决定 --cursor-interaction
  root.dataset.pointerCursors = String(next.usePointerCursors);
  // 「字体平滑」：settings.css 里读这个属性决定 -webkit-font-smoothing
  root.dataset.fontSmoothing = String(next.fontSmoothing);
}

export function getSettings(): CodexSettings {
  return state;
}

export function updateSettings(patch: Partial<CodexSettings>) {
  state = { ...state, ...patch };
  persist();
  applySettings();
  for (const listener of listeners) listener();
}

/**
 * 一键恢复默认（设置页「重置为默认设置」入口调用；UI 见 ./reset-settings.tsx）。
 *
 * ⚠️ 与 updateSettings 的关键差别：这里**把存储键删掉**，而不是写回一份「默认值 JSON」。
 * 口径与「默认档一个 inline 变量都不写」一致 —— 存储里没有 codex.settings 时
 * load() 本来就返回 DEFAULT_SETTINGS（store.ts:212-222），行为等价，但状态更干净，
 * 也让「重置有没有真的清掉」可以被一条断言判死（getItem → null）。
 *
 * 清 inline 的口径：这里调用的 `applySettings()` 会对**两个宿主**（`<html>` 与 `<body>`）各
 * removeProperty 一次 —— §3.7b 补偿选择器删掉之后，body 上也必须真的清干净，否则默认档会
 * 残留上一次选的 `--font-code-size`（行为用例 st.reset.clears-inline 的判据）。
 *
 * 只动本键：codex.api（自定义 API）/ codex.conversations / codex.messages.* /
 * codex.sidebar.* 一律不碰 —— 保护清单见 reset-settings.tsx 头注释。
 */
export function resetSettings() {
  state = DEFAULT_SETTINGS;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 隐私模式 / 配额满：内存里照样回默认档，只是没落盘
    }
  }
  applySettings();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): CodexSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** 单项读写：const [size, setSize] = useSetting("codeFontSize") */
export function useSetting<K extends keyof CodexSettings>(key: K) {
  const settings = useSettings();
  return [
    settings[key],
    (value: CodexSettings[K]) => updateSettings({ [key]: value } as Partial<CodexSettings>),
  ] as const;
}

applySettings();
