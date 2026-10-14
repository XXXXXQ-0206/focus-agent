import { Eye, EyeOff } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Button,
  Input,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/ui";

import { normalizeChord } from "./commands";
import "./settings.css";

/**
 * 设置页控件原语。
 *
 * 全部按 SPEC §5「控件几何与样式」实测实现（常规页全量 DOM 量测）：
 *   下拉触发按钮  高 **28** · 圆角 **12.5** · bg rgba(255,255,255,.03) · padding 0 12px · 13px/430/18
 *   次要按钮      **43×28** · 圆角 12.5 · bg oklab(.903646 …/.05) · padding 0 8px · 13px/430 · 列内 gap 4
 *   分段控件      高 **23** · 每段宽 43 · 圆角 9999 · padding 2px 8px · 选中底 oklab(…)/0.05
 *   快捷键录制钮  **28×28** · 圆角 12.5 · 无底色
 *   值文本        **192×16**（w-48）· 12px/430/16 · 单行省略
 * 这些数值都落到 settings.css 的 .cx-settings 作用域里，不去改 @/ui（那属 W5 基础件）。
 */

export interface SettingsOption<T extends string = string> {
  value: T;
  label: string;
}

/** 下拉按钮（SPEC §5：高 28 / 圆角 12.5 / bg rgba(255,255,255,.03) / padding 0 12px / 13px/430） */
export function SettingsSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SettingsOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select onValueChange={(next) => onChange(next as T)} value={value}>
      <SelectTrigger aria-label={label} className={cn("cx-settings-select", className)} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 次要按钮（SPEC §5：43×28 / 圆角 12.5 / bg oklab(0.903646 … / 0.05) / padding 0 8px / 13px/430）。
 * 43×28 是「更改」「查看」两个两字标签的实测尺寸，由 padding 0 8px + 13px/430 自然得到。
 */
export function SettingsButton({
  children,
  onClick,
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <Button
      className={cn("cx-settings-btn", className)}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type={type}
      variant="soft"
    >
      {children}
    </Button>
  );
}

/** 分段控件（SPEC §5：高 23 / 段宽 43 / 圆角 9999 / padding 2px 8px / 13px/430）。用于「跟进处理方式」 */
export function SettingsSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SettingsOption<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="cx-settings-segmented">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className="cx-settings-segmented__item"
          data-selected={value === option.value ? "" : undefined}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** 值文本（SPEC §5：192×16 / 12px/430/16 / 单行省略，官方 class w-48） */
export function SettingsValueText({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("cx-settings-value", className)} title={value}>
      {value || "未设置"}
    </span>
  );
}

/** 徽标：标「未实测」「附加」这类**证据状态**，不冒充官方项（SPEC §8） */
export function SettingsBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn";
}) {
  return (
    <span className="cx-settings-badge" data-tone={tone}>
      {children}
    </span>
  );
}

const NOOP = () => {};

/**
 * 开关（尺寸/配色在 settings.css 里覆盖成 SPEC §5 实测的 **32×20**；@/ui 默认是 32×19）。
 *
 * · `disabled`：官方「默认权限」那一行**写死** `{checked:!0, disabled:!0, onChange: yo}`
 *   （yo = `function yo(){}`，见 general-settings-c429ae79df7c.js）——
 *   即「永远开 + 不可点」，视觉是官方的 `cursor-not-allowed opacity-60`（settings.css 里落地）。
 * · `ariaLabel`：可见标签 `label` 与官方 aria-label 不同时用官方那条 toggle 文案
 *   （如 `settings.agent.permissionsMode.default.toggle`「默认权限始终显示」）。
 * · `onChange` 可省（disabled 行不需要）。
 */
export function SettingsSwitch({
  label,
  ariaLabel,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  /** 官方 aria-label（省略时用可见标签） */
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <Switch
      aria-label={ariaLabel ?? label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange ?? NOOP}
    />
  );
}

/**
 * 快捷键录制按钮（SPEC §5：**28×28** · 圆角 12.5 · 无底色）。
 * 点一下进入录制：捕获下一个组合键（normalizeChord，与快捷键页同一套归一化），
 * Esc 取消、Backspace/Delete 清空（= 未分配）。
 */
export function SettingsHotkeyButton({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (chord: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  const stop = useCallback(() => setRecording(false), []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        stop();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        onChange("");
        stop();
        return;
      }
      const chord = normalizeChord(event);
      // 只按修饰键时继续等待（normalizeChord 会返回 "Ctrl" 这类半成品）
      if (!chord || ["Ctrl", "Alt", "Shift", "Meta"].includes(chord)) return;
      onChange(chord);
      stop();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, stop]);

  return (
    <button
      aria-label={`${label}：${recording ? "请按下组合键" : value || "未分配"}`}
      className="cx-settings-hotkey"
      data-recording={recording ? "" : undefined}
      onClick={() => setRecording((prev) => !prev)}
      ref={ref}
      type="button"
    >
      {recording ? <span className="cx-settings-hotkey__hint">按下…</span> : null}
      {!recording && value ? <Kbd>{value}</Kbd> : null}
    </button>
  );
}

/** 表单行：标签 + 控件 + 帮助文案 + 校验信息（自定义 API 页用） */
export function SettingsField({
  label,
  help,
  error,
  warn,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  warn?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="cx-settings-field">
      <label className="cx-settings-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help ? <p className="cx-settings-field__help">{help}</p> : null}
      {error ? <p className="cx-settings-field__error">{error}</p> : null}
      {warn ? <p className="cx-settings-field__warn">{warn}</p> : null}
    </div>
  );
}

/** 密码输入 + 显隐切换（apiKey 用；官方无此控件，属工程实现） */
export function SettingsSecretInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      aria-label={label}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      trailing={
        <button
          aria-label={visible ? "隐藏 API Key" : "显示 API Key"}
          className="cx-settings-iconbtn"
          onClick={() => setVisible((prev) => !prev)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
        </button>
      }
      type={visible ? "text" : "password"}
      value={value}
    />
  );
}

export { Textarea };
