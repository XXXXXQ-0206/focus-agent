import { useCallback, useState } from "react";

import { useTheme } from "@/app/theme-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTrigger,
  Button,
  toast,
} from "@/ui";
import { resetAllCommandChords } from "./commands";
import { SettingsBadge } from "./controls";
import { SETTINGS_PANES } from "./panes";
import { clearPaneState } from "./panes/pane-state";
import { SettingsCard, SettingsRow, SettingsSection } from "./SettingsRow";
import { resetSettings } from "./store";

/**
 * 重置 / 恢复默认（**设置页维护入口**，行为用例 `st.reset.clears-inline` 依赖它）。
 *
 * ── 一、官方有没有这个东西？**有**（不是本工程发明）────────────────────────────
 * 证据文件（官方发行产物，可复算）：
 *   `app/webview/assets/general-settings-c429ae79df7c.js` —— 官方的「常规 + 外观」chunk
 *   （本机路径：`C:\Users\熊骞\Documents\Focus\2026-10-09\codex-desktop-unpack\outputs\codex-desktop-electron`）
 *
 *   · 消息 id **`settings.appearance.resetToDefault`**
 *     defaultMessage `Reset to default`
 *     description    "Button that immediately restores all Advanced appearance preferences to their defaults"
 *     → 即「**外观**页」里的重置按钮，作用域写死是「高级外观偏好」（Advanced appearance）。
 *   · 渲染位置：外观页（slug `appearance`）的「高级」区 ——
 *     分组标题 id `settings.appearance.advanced`（zh-CN = 「高级」）。
 *   · 官方按钮属性（同 chunk，偏移 86443 附近）：`Button color=ghostTertiary radius=small
 *     size=inline className=text-base`；点击**直接执行**，**没有二次确认弹窗**（原文 "immediately
 *     restores"）。
 *   · 官方只在这些条件之一成立时才**渲染**它：`separateModes` / 浅色或深色的
 *     `hasAdvancedThemeChanges` / 受管设置里有一项 ≠ 默认；点击重置的集合 =
 *     「light + dark 的高级主题设置」∪「[codeFontSize, sansFontSize, reducedMotionPreference,
 *     diffMarkerStyle, usePointerCursors, useFontSmoothing, dockIconPreference, fontSize,
 *     fullWidth, smartPunctuationEnabled] 中偏离默认的项」（同 chunk 的 `$o` 列表）。
 *   · 官方中文文案（zh-CN 语言包，可直接复算）：
 *     `settings.appearance.resetToDefault` = 「重置为默认设置」；
 *     失败提示 `settings.appearance.resetError` = 「部分外观设置无法重置。请重试。」
 *
 * ── 二、本工程怎么落地（差异逐条标注，绝不冒充官方）──────────────────────────
 *   · **位置与文案用官方的**：外观页页尾加「重置」分区，入口按钮文案 = 官方原文「重置为默认设置」。
 *   · ⚠️ 偏差 1（官方**无**）：**加了二次确认 AlertDialog**（交办要求）。
 *     官方唯一的同语义确认弹窗在**快捷键页**：`settings.keyboardShortcuts.resetAllConfirm.*` =
 *     标题「重置所有键盘快捷键？」/ 说明「这将丢弃所有自定义快捷键并恢复默认设置」/
 *     确认「全部重置」/ 取消「取消」—— 本工程沿用它的**确认/取消文案口径**（重置面更广，标题另写）。
 *   · ⚠️ 偏差 2（官方**无**）：**作用域扩大**。官方只重置高级外观偏好；本工程把这一页
 *     的档位一起清。⚠️ [task-90] 更正：原先写「『本还原工程附加』的 4 个档位（字号 / 行距密度 /
 *     **代码字号** / 圆角倍率）」—— 其中 **代码字号与界面字号已确认是官方行**（官方外观页第 7/8 行，
 *     docs/RECON-TASK88-APPEARANCE-ROWS.md），只有字号档 / 行距密度 / 圆角倍率仍属本工程附加；
 *     清的是**整条 `codex.settings` 键**，所以官方那两行与附加档位一起回默认 —— 与上面 §一 的官方
 *     `sansFontSize` / `codeFontSize` 列表方向一致（官方那条重置列表本来就含这两个名字）。
 *     清空它们之后，`applySettings` 会对 **`<html>` 与 `<body>` 成对** removeProperty（store.ts:270-318），
 *     所以「重置」不仅回默认值，也真的抹掉两边 inline 的那 9 个受管变量。
 *   · ⚠️ 偏差 3（官方**无**）：官方按钮在「没有改动」时不渲染；本工程入口**常驻**，
 *     保证入口可发现、且行为用例能稳定点到。
 *
 * ── 三、行为契约（**行为组按这个判**；这是一条两段式交互）─────────────────────
 *   ① 点入口 `[data-settings-reset="entry"]` → 只弹确认框（**此时什么都不改**）
 *   ② 点确认 `[data-settings-reset="confirm"]`（文案「全部重置」）之后：
 *      1. `<html>` 与 `<body>` inline style 上 9 个受管变量**全部消失**（回到官方 token；两个宿主同时清，不允许留半份）：
 *         `--font-ui-size` `--text-xs` `--text-sm` `--text-base` `--text-lg` `--text-xl`
 *         `--font-code-size` `--height-token-settings-row` `--corner-radius-scale`
 *      2. `:root` 数据属性回默认档：`data-reduced-motion="false"`、
 *         `data-pointer-cursors="true"`、`data-font-smoothing="true"`（store.ts:267-271）
 *      3. localStorage：`codex.settings` / `codex.commands`（键位改写）/ `cx.pane.*`
 *         **被删除**（getItem → null，不是写回一份默认 JSON）；
 *         `codex.theme` 回到官方默认 **"system"**（见下条的「为什么不是删键」）
 *      4. **保护清单（一律不动）**：`codex.conversations` / `codex.messages.*`（会话数据）、
 *         `codex.sidebar.*`（侧栏布局）。
 *         （`codex.api` 是历史遗留的本机直连配置 —— 2026-10-16 直连链路已从界面删除，
 *          键本身仍然不碰，用户真填过就不会因为一次重置被抹掉。）
 *   ③ 点「取消」/ Esc → 关闭弹窗，**一个键、一个变量都不改**。
 *
 * 「为什么 codex.theme 是写回默认档而不是删键」：主题的 React 状态在
 * `src/app/theme-provider.tsx`。这里通过 `useTheme().setMode(默认档)` 复位 ——
 * 它同时写 `<html data-theme=…>`、`class=…` 与 localStorage。**只删键**的话
 * ThemeProvider 的内存态会停在旧值（单选显示「浅色」而界面是深色，属可见不自洽），
 * 所以走 setMode 是唯一不脱节的做法；而默认档 = `system`
 * （官方设置注册表 `XN.theme` default:"system"，app-shared @2995547；
 * ThemeProvider 侧同步为 theme-provider.tsx:26 `?? "system"`）。
 */

/** 官方文案 `settings.appearance.resetToDefault`（zh-CN 语言包原文） */
export const RESET_SETTINGS_LABEL = "重置为默认设置";
/** 确认框标题：官方无此弹窗，标题按官方按钮文案 + 疑问句（工程文案） */
export const RESET_SETTINGS_CONFIRM_TITLE = "重置为默认设置？";
/**
 * 确认框副标题（header 里那一行）。
 * ⚠️ 这里**只能放一句话**：@/ui 的 .cx-dialog__header 固定 50 高、标题与 description
 * **左右并排**（ui.css:1727 起；dev-preview 的 09-alert-dialog.png 就是这个样子）——
 * 长文案会从 50 高里溢出去（本工程实测踩过：标题被压成三行、正文压到卡片外）。
 * 作用域明细放 RESET_SETTINGS_CONFIRM_SCOPE，挂在 .cx-dialog__body 里（官方 Body 16px 20px）。
 */
export const RESET_SETTINGS_CONFIRM_LEAD = "这会丢弃本工程的全部本地设置并回到默认档。";
/**
 * 确认框作用域明细：官方无全局重置的说明文案（只有快捷键页的 resetAllConfirm.description），
 * 这里逐条写清「会清什么 / 不会动什么」，避免用户以为会丢会话或 API 配置。
 */
export const RESET_SETTINGS_CONFIRM_SCOPE =
  "将清掉 <html> 与 <body> 上的字号 / 行距 / 代码字号 / 圆角倍率 inline 变量与本地键 " +
  "codex.settings、codex.commands（键位改写）、cx.pane.*，主题恢复默认「深色」。" +
  "不会动：会话记录（codex.conversations / codex.messages.*）、" +
  "侧栏布局（codex.sidebar.*）。";
/** 确认按钮：官方快捷键页同语义弹窗的确认文案（settings.keyboardShortcuts.resetAllConfirm.confirm） */
export const RESET_SETTINGS_CONFIRM_ACTION = "全部重置";
/** 取消按钮：官方 settings.keyboardShortcuts.resetAllConfirm.cancel = 「取消」 */
export const RESET_SETTINGS_CONFIRM_CANCEL = "取消";
/** 失败提示：官方只有外观域文案（settings.appearance.resetError），本工程的失败面更广 → 工程文案 */
export const RESET_SETTINGS_ERROR = "重置失败：本地存储不可写（隐私模式或配额不足）";

/**
 * 主题默认档 = 官方**有效缺省** `system`。
 * 出处：官方设置注册表 `XN.theme`（app-shared-40678a67f0e3.js @2995547
 * `default: "system"`, `key: "appearanceTheme"`, `schema: ["system","light","dark"]`）
 * ＋ 本工程 `src/app/theme-provider.tsx:26` 的 `?? "system"`（task-78 同步收口）。
 * （ThemeProvider 未导出 ThemeMode / 默认值常量，所以在本地复述一次。）
 */
const DEFAULT_THEME_MODE = "system" as const;

/** 15 个取证页的本地键前缀（出处：`./panes/pane-state.ts:17` STORAGE_PREFIX） */
const PANE_STORAGE_PREFIX = "cx.pane.";

/**
 * 清掉 15 个取证页的本地状态。
 *
 * 走 `clearPaneState(section)` 而不是直接删键：它会同时**通知已挂载的页面**重新按默认值渲染
 * （pane-state.ts:65-73），这样「重置」在跨页场景下也自洽。注册表之外的残留键（例如以后下线的
 * 分区）再用前缀扫一遍兜底。
 */
export function clearPaneStates() {
  if (typeof window === "undefined") return;
  for (const section of Object.keys(SETTINGS_PANES)) clearPaneState(section);
  const stale: string[] = [];
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(PANE_STORAGE_PREFIX)) stale.push(key);
  }
  for (const key of stale) window.localStorage.removeItem(key);
}

export type ResetThemeMode = "dark" | "light" | "system";

/**
 * 一键恢复默认（**只碰本工程自己的键**）：
 *   设置项（codex.settings + `<html>`/`<body>` 两个宿主上的 inline 变量）→ 键位改写（codex.commands）
 *   → 15 个取证页状态（cx.pane.*）→ 主题（codex.theme 写回默认档 system）。
 * 顺序无关但有意这样排：设置项先回默认档，页面的档位控件第一帧就是默认值，不会闪一下旧值。
 *
 * @param setThemeMode `useTheme().setMode`
 */
export function resetProjectSettings(setThemeMode: (mode: ResetThemeMode) => void) {
  resetSettings();
  resetAllCommandChords();
  clearPaneStates();
  setThemeMode(DEFAULT_THEME_MODE);
}

/**
 * 「重置」分区：官方入口（外观页 → 高级「重置为默认设置」）+ 本工程要求的二次确认。
 * 挂载点见 `./sections/AppearanceSection.tsx` 页尾（官方位置就是外观页）。
 */
export function ResetSettingsSection() {
  const { setMode } = useTheme();
  const [open, setOpen] = useState(false);

  const runReset = useCallback(() => {
    try {
      resetProjectSettings(setMode);
    } catch {
      // localStorage 被禁用（隐私模式）时 removeItem 会抛；内存态已经回默认档，只是没落盘
      toast.error(RESET_SETTINGS_ERROR);
    }
  }, [setMode]);

  return (
    <SettingsSection
      tag={<SettingsBadge tone="warn">官方入口：外观 → 高级 · 本工程加二次确认并扩大作用域</SettingsBadge>}
      title="重置"
    >
      <SettingsCard>
        <SettingsRow
          control={
            <AlertDialog onOpenChange={setOpen} open={open}>
              <AlertDialogTrigger asChild>
                <Button
                  className="cx-settings-btn"
                  data-settings-reset="entry"
                  size="sm"
                  type="button"
                  variant="soft"
                >
                  {RESET_SETTINGS_LABEL}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                data-settings-reset="dialog"
                description={RESET_SETTINGS_CONFIRM_LEAD}
                footer={
                  <>
                    <AlertDialogCancel asChild>
                      <Button data-settings-reset="cancel" size="sm" variant="ghost">
                        {RESET_SETTINGS_CONFIRM_CANCEL}
                      </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button data-settings-reset="confirm" onClick={runReset} size="sm" variant="solid">
                        {RESET_SETTINGS_CONFIRM_ACTION}
                      </Button>
                    </AlertDialogAction>
                  </>
                }
                title={RESET_SETTINGS_CONFIRM_TITLE}
              >
                {/* 作用域明细走官方 Body（16px 20px 内距），不塞进固定 50 高的 header */}
                <div className="cx-dialog__body">
                  <p className="cx-dialog__description">{RESET_SETTINGS_CONFIRM_SCOPE}</p>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          }
          description={
            "官方文案与位置（settings.appearance.resetToDefault = 「重置为默认设置」，外观 → 高级）：" +
            "官方无确认框、只重置高级外观偏好；本工程加了确认框，作用域扩大到本页「本还原工程附加」的" +
            "字号 / 行距 / 代码字号 / 圆角倍率与本工程的本地设置键。"
          }
          label={RESET_SETTINGS_LABEL}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
