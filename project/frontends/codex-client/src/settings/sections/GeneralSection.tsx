import { useTheme } from "@/app/theme-provider";
import { RadioGroup, RadioItem } from "@/ui";

import { type SettingsOption, SettingsSelect, SettingsSwitch } from "../controls";
import { ResetSettingsSection } from "../reset-settings";
import { SettingsCard, SettingsRow, SettingsSection } from "../SettingsRow";
import {
  type CornerScale,
  type EnterBehavior,
  type FollowUpMode,
  type NotificationSound,
  type OpenTarget,
  type SettingsDensity,
  type TurnCompleteNotification,
  updateSettings,
  useSettings,
} from "../store";

/**
 * 常规（官方 slug general-settings）。
 *
 * ── 2026-10-14 按用户定稿重写 ────────────────────────────────────────────
 * 用户口径（逐条执行）：常规 = ①发送快捷键 ②跟进/排队方式 ③完成与通知 ④默认打开位置
 * ⑤字体（界面字号 / 代码字号）⑥密度 ⑦主题 ⑧圆角；「其他全删」。
 * 因此本页从原来的 20+ 行（权限 / 文件夹 / 终端 Shell / 语言 / 关闭确认 /
 * 底部面板 / 弹窗快捷键…，其中绝大多数没有任何真实承接）砍到下面这 8 行，
 * **每一行都落在真实生效的开关上**，description 里逐行写明落在哪：
 *
 *   ① 发送快捷键   → `enterBehavior`：聊天输入框的 Enter / Ctrl+Enter 语义（Composer 读它）
 *   ② 跟进方式     → `followUpMode`：生成中再发消息时「排队」还是「引导（中断并发送）」
 *   ③ 完成与通知   → `turnCompleteNotification` + `notificationSound`：
 *                    生成结束时按窗口聚焦状态提示，并可选播放提示音（ConversationView 读它）
 *   ④ 默认打开位置 → `defaultOpenTarget`：工作区文件点开时「应用内预览」还是「下载到本机」
 *   ⑤ 字体         → `sansFontSize` / `codeFontSize`：写 --font-ui-size / --font-code-size
 *   ⑥ 密度         → `density`：写 --spacing-token-* 一组密度变量
 *   ⑦ 主题         → `useTheme`：写 <html data-theme>（浅/深/跟随系统）
 *   ⑧ 圆角         → `cornerScale`：写 --radius-*-base 的倍率
 *
 * 被删掉的行（连同原『外观』页里那些「官方有、本工程接不上」的行：差异标记 / Dock 图标 /
 * 字体平滑 / 减少动效开关 / 指针光标 / 智能标点；以及原『键盘快捷键』整页）不再出现在 UI，
 * store 里对应的字段保留默认值以免破坏已存 localStorage（无 UI 入口即无新写入）。
 */

const ENTER_OPTIONS: ReadonlyArray<SettingsOption<EnterBehavior>> = [
  { value: "enter", label: "按 Enter 键发送" },
  { value: "modifier-enter", label: "按 Ctrl+Enter 键发送" },
];

const FOLLOW_UP_OPTIONS: ReadonlyArray<SettingsOption<FollowUpMode>> = [
  { value: "queue", label: "排队（等当前回答结束后发送）" },
  { value: "steer", label: "引导（立即中断当前回答并发送）" },
];

const COMPLETION_OPTIONS: ReadonlyArray<SettingsOption<TurnCompleteNotification>> = [
  { value: "unfocused", label: "仅在未聚焦时" },
  { value: "always", label: "始终" },
  { value: "never", label: "从不" },
];

const OPEN_TARGET_OPTIONS: ReadonlyArray<SettingsOption<OpenTarget>> = [
  { value: "preview", label: "应用内预览" },
  { value: "download", label: "下载到本机" },
];

const DENSITY_OPTIONS: ReadonlyArray<SettingsOption<SettingsDensity>> = [
  { value: "comfortable", label: "舒适" },
  { value: "compact", label: "紧凑" },
];

const CORNER_OPTIONS: ReadonlyArray<SettingsOption<CornerScale>> = [
  { value: "standard", label: "标准（×1.25）" },
  { value: "compact", label: "紧凑（×1）" },
];

/** 官方外观页的数值字号控件形态：`input` 64×28 + 「px」单位（task-88 实测，搬到常规页后不变） */
function FontSizeInput({
  ariaLabel,
  max,
  min,
  onChange,
  value,
}: {
  ariaLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="cx-num-input">
      <input
        aria-label={ariaLabel}
        className="cx-num-input__field"
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) onChange(next);
        }}
        type="number"
        value={value}
      />
      <span className="cx-num-input__unit">px</span>
    </div>
  );
}

export function GeneralSection() {
  const { mode, setMode } = useTheme();
  const settings = useSettings();

  return (
    <>
      <SettingsSection title="输入">
        <SettingsCard>
          <SettingsRow
            control={
              <SettingsSelect
                label="发送快捷键"
                onChange={(value) => updateSettings({ enterBehavior: value })}
                options={ENTER_OPTIONS}
                value={settings.enterBehavior}
              />
            }
            description="聊天输入框里哪个键发送消息（另一个键换行）"
            label="发送快捷键"
          />
          <SettingsRow
            control={
              <SettingsSelect
                label="跟进方式"
                onChange={(value) => updateSettings({ followUpMode: value })}
                options={FOLLOW_UP_OPTIONS}
                value={settings.followUpMode}
              />
            }
            description="回答还在生成时又发了一条消息，是排队等它说完还是直接打断它"
            label="跟进 / 排队方式"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="完成与通知">
        <SettingsCard>
          <SettingsRow
            control={
              <SettingsSelect
                label="轮次完成通知"
                onChange={(value) => updateSettings({ turnCompleteNotification: value })}
                options={COMPLETION_OPTIONS}
                value={settings.turnCompleteNotification}
              />
            }
            description="一轮回答结束时发系统通知（需要浏览器授权；「仅在未聚焦时」= 切走窗口才提示）"
            label="轮次完成通知"
          />
          <SettingsRow
            control={
              <SettingsSwitch
                checked={settings.notificationSound !== "none"}
                label="提示音"
                onChange={(checked) =>
                  updateSettings({ notificationSound: (checked ? "default" : "none") as NotificationSound })
                }
              />
            }
            description="通知时播放一声提示音（Web Audio 合成，不需要音频文件）"
            label="提示音"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="打开位置">
        <SettingsCard>
          <SettingsRow
            control={
              <SettingsSelect
                label="默认打开位置"
                onChange={(value) => updateSettings({ defaultOpenTarget: value })}
                options={OPEN_TARGET_OPTIONS}
                value={settings.defaultOpenTarget}
              />
            }
            description="在工作区里点开一个文件时的默认动作"
            label="默认打开位置"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="显示">
        <SettingsCard>
          <SettingsRow
            control={
              <RadioGroup
                className="cx-mode-tiles"
                onValueChange={(value) => setMode(value as "dark" | "light" | "system")}
                value={mode}
              >
                <RadioItem className="cx-mode-tile" label="系统" value="system" />
                <RadioItem className="cx-mode-tile" label="浅色" value="light" />
                <RadioItem className="cx-mode-tile" label="深色" value="dark" />
              </RadioGroup>
            }
            description="跟随系统 / 浅色 / 深色（写 <html data-theme>）"
            label="主题"
          />
          <SettingsRow
            control={
              <FontSizeInput
                ariaLabel="界面字体大小"
                max={20}
                min={10}
                onChange={(value) => updateSettings({ sansFontSize: value })}
                value={settings.sansFontSize}
              />
            }
            description="界面与正文的基础字号（写 --font-ui-size）"
            label="界面字号"
          />
          <SettingsRow
            control={
              <FontSizeInput
                ariaLabel="代码字体大小"
                max={16}
                min={10}
                onChange={(value) => updateSettings({ codeFontSize: value })}
                value={settings.codeFontSize}
              />
            }
            description="聊天里的代码块与差异视图字号（写 --font-code-size）"
            label="代码字体大小"
          />
          <SettingsRow
            control={
              <SettingsSelect
                label="密度"
                onChange={(value) => updateSettings({ density: value })}
                options={DENSITY_OPTIONS}
                value={settings.density}
              />
            }
            description="列表与消息行的间距（写密度变量组）"
            label="密度"
          />
          <SettingsRow
            control={
              <SettingsSelect
                label="圆角"
                onChange={(value) => updateSettings({ cornerScale: value })}
                options={CORNER_OPTIONS}
                value={settings.cornerScale}
              />
            }
            description="界面圆角倍率（写 --radius-*-base）"
            label="圆角"
          />
          {/*
            2026-10-15 从原『外观』页搬回来的三行 —— 都是**真实生效**的开关
            （写 :root 的 data-* 属性，base.css / ui.css 消费）：
              · 减少动态效果 → :root[data-reduced-motion]
              · 字体平滑     → :root[data-font-smoothing]（-webkit-font-smoothing）
              · 使用指针光标 → :root[data-pointer-cursors]
            同页的「差异标记」没有恢复：全仓只有 store 与重置清单引用 diffMarkerStyle，
            没有任何 diff 视图消费它（复刻官方行但不会生效），按用户口径不摆假开关。
          */}
          <SettingsRow
            control={
              <SettingsSwitch
                checked={settings.reducedMotion}
                label="减少动态效果"
                onChange={(checked) => updateSettings({ reducedMotion: checked })}
              />
            }
            description="关掉界面过渡与动画（写 :root[data-reduced-motion]）"
            label="减少动态效果"
          />
          <SettingsRow
            control={
              <SettingsSwitch
                checked={settings.fontSmoothing}
                label="字体平滑"
                onChange={(checked) => updateSettings({ fontSmoothing: checked })}
              />
            }
            description="使用系统原生字体抗锯齿（写 :root[data-font-smoothing]）"
            label="字体平滑"
          />
          <SettingsRow
            control={
              <SettingsSwitch
                checked={settings.usePointerCursors}
                label="使用指针光标"
                onChange={(checked) => updateSettings({ usePointerCursors: checked })}
              />
            }
            description="悬停可点元素时切换为手型光标（写 :root[data-pointer-cursors]）"
            label="使用指针光标"
          />
        </SettingsCard>
      </SettingsSection>

      {/* 本还原工程附加：把 localStorage 里的设置一次性重置回默认档（官方无此分区，标注清楚） */}
      <ResetSettingsSection />
    </>
  );
}
