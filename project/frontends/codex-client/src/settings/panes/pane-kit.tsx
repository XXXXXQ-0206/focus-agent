import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTrigger,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/ui";

import { newPaneId } from "./pane-state";
import "./panes.css";

/**
 * 15 个取证页共用的行/卡片/控件套件（C2 私有，与 C1 的 SettingsRow 解耦）。
 *
 * 几何出处（docs/SPEC-SETTINGS.md，本机只有「常规」页有 DOM 实测）：
 *   · 内容列 728 居中、列内 padding 20px、分区间距 40px —— §2.1（实测·DOM）
 *   · 卡片 bg rgb(35,35,35) / 圆角 20px / 发丝边框 0.667px rgba(255,255,255,.082) —— §2.1、§7.3
 *   · 行 padding 12px 16px、列间 gap 24px —— §2.1（实测·DOM）
 *   · 行高内容自适应：单行 61 / 无说明 44 / 两行说明 77（= 12+12 内距 + 内容）—— §4.1、§7.1
 *   · 标签 13px/500/19、说明 12px/430/16 · 白 65% —— §2.1（实测·DOM）
 *   · 下拉触发按钮 高 28 / 圆角 12.5 / bg rgba(255,255,255,.03) / padding 0 12px / 13px 430 —— §5
 *   · 次要按钮 43x28 / 圆角 12.5 / bg oklab(…)/0.05 / padding 0 8px —— §5
 *   · 分段控件 高 23 / 圆角 9999 / padding 2px 8px / 选中底 oklab(…)/0.05 —— §5
 *   · 值文本 192x16（官方 w-48）、12px/430/16 单行省略 —— §5
 *   · 开关 32x20 —— §5（我们用 src/ui 的 Switch，其 token 为 32x19，见 §7.2 冲突说明）
 *
 * 除「常规」外 17 个页面没有任何几何实测（§8.1）：本套件的间距/字号即通用规格推导，
 * 各页面文件里也会再标一次「此页无实测几何，按通用规格推导」。
 */

export interface PaneOption {
  value: string;
  label: string;
  description?: string;
}

/** 页面外壳：h1 28px/500（§2.1 实测）+ 可选一行说明 + 分区栈（分区之间 40px） */
export function PaneShell({
  title,
  lede,
  actions,
  children,
  section,
  standalone,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  section?: string;
  /**
   * 独立渲染（无宿主标题带）时自绘 H1。默认 false：
   * C1 的 SettingsPage 已经渲染官方标题带（h1 28px/500 + NavItem.description 作 lede），
   * 并把本组件放进 .cx-settings__column（768 列 + padding 20px + 分区间距 40px），
   * 所以页面自身只输出「内容区」——避免出现两个 H1 与双重内距。
   */
  standalone?: boolean;
}) {
  return (
    <div
      /* [task-55] 去掉冗余别名 cx-settings-pane：全仓 CSS 从无该规则（git log -S 0），
         同元素的 cx-pane 才是被定义的（产物里 ×94）。 */
      className="cx-pane"
      data-pane={section}
      data-standalone={standalone ? "" : undefined}
    >
      <div className="cx-pane__column">
        {standalone ? (
          <header className="cx-pane__header">
            {/* [task-55] 同上去别名：cx-pane__title 已在产物里定义（×1） */}
            <h1 className="cx-pane__title">{title}</h1>
            {/* [task-55] 同上去别名：cx-pane__lede 已在产物里定义（×1） */}
            {lede ? <p className="cx-pane__lede">{lede}</p> : null}
          </header>
        ) : null}
        {actions ? <div className="cx-pane__page-actions">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}

/** 分区：标题 14px/500（§2.1）+ 标题带 padding-bottom 6px + 卡片之间 16px */
export function PaneSection({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cx-pane__section">
      {title || actions ? (
        <div className="cx-pane__section-head">
          <div className="cx-pane__section-titles">
            {title ? <h2 className="cx-pane__section-title">{title}</h2> : null}
            {description ? <p className="cx-pane__section-description">{description}</p> : null}
          </div>
          {actions ? <div className="cx-pane__section-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** 卡片：一列行，行之间发丝分隔线（§2.1 行分隔线；官方写法 &>*:not(:last-child)） */
export function PaneCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("cx-pane__card", className)}>{children}</div>;
}

/** 设置行：标签 + 说明 + 右侧控件；block 时控件另起一行（长文本域/列表/预览用） */
export function PaneRow({
  label,
  description,
  control,
  block,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  block?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("cx-pane__row", className)} data-block={block ? "" : undefined}>
      <div className="cx-pane__row-main">
        <span className="cx-pane__row-label">{label}</span>
        {description ? <span className="cx-pane__row-description">{description}</span> : null}
      </div>
      {control ? <div className="cx-pane__row-control">{control}</div> : null}
    </div>
  );
}

/** 状态条 info/warning/danger —— 「无法检查导入项」「本地环境不可用」这类错误态 */
export function PaneBanner({
  tone = "info",
  title,
  description,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cx-pane__banner" data-tone={tone} role="status">
      <div className="cx-pane__banner-main">
        <span className="cx-pane__banner-title">{title}</span>
        {description ? <span className="cx-pane__banner-description">{description}</span> : null}
      </div>
      {action ? <div className="cx-pane__banner-action">{action}</div> : null}
    </div>
  );
}

/** 空态：图标 + 标题 + 说明 + 可选主操作（官方 15 页里 9 页有 *.empty* 消息） */
export function PaneEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cx-pane__empty">
      {icon ? <div className="cx-pane__empty-icon">{icon}</div> : null}
      <div className="cx-pane__empty-title">{title}</div>
      {description ? <div className="cx-pane__empty-description">{description}</div> : null}
      {action ? <div className="cx-pane__empty-action">{action}</div> : null}
    </div>
  );
}

/** 分段控件（§5：高 23 / 圆角 9999 / padding 2px 8px / 选中底 oklab(…)/0.05） */
export function PaneTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="cx-pane__segmented" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className="cx-pane__segment"
          data-selected={tab.value === value ? "" : undefined}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 下拉（§5：高 28 / 圆角 12.5 / bg rgba(255,255,255,.03) / padding 0 12px / 13px 430）。
 *
 * `option.description` 是**列表里的第二行**，永远不进触发器 —— Radix 会把选中项的
 * `ItemText` 内容 portal 进触发器，28px 高的按钮里放两行会顶出边框（2026-10-15 用户截图）。
 * 所以说明走 `SelectItem` 的 `description` 槽（`ItemText` 的兄弟节点，见 @/ui/select.tsx）。
 */
export function PaneSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PaneOption[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  /**
   * 值为空时会渲染成一个**空触发器**（Radix 的 SelectValue 对 "" 直接走 placeholder 分支，
   * 没给 placeholder 就什么都没有）。所以这里兜底：选项表里如果有 `value: ""` 的项，
   * 就拿它的 label 当占位文案 —— 「不发送（端点默认）」这种语义本来就在选项里写着，
   * 不该让用户对着一个空白下拉猜当前是什么。（2026-10-16 高级区实测发现）
   */
  const emptyOptionLabel = options.find((option) => option.value === "")?.label;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("cx-pane__select", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? emptyOptionLabel} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem description={option.description} key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 开关（官方 32x20；Radix Switch 渲染 button[role=switch]，用 aria-label 关联语义） */
export function PaneSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return <Switch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />;
}

/**
 * 值文本（§5：192x16 = 官方 w-48、12px/430/16、单行省略）+ 可选「更改」次要按钮（43x28）。
 * 官方用例：常规页「无项目任务文件夹」= 路径 + 更改；Git 页「工作树根目录」同构。
 */
export function PaneValueText({
  value,
  title,
  actionLabel,
  onAction,
  mono,
}: {
  value: string;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  mono?: boolean;
}) {
  return (
    <span className="cx-pane__value-group">
      <span className={cn("cx-pane__value", mono && "cx-pane__value--mono")} title={title ?? value}>
        {value}
      </span>
      {actionLabel && onAction ? (
        <Button size="sm" variant="soft" color="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </span>
  );
}

/** 文本域行（block 布局）：标签 + 说明 + 多行输入 + 可选底部计数/操作 */
export function PaneTextBlock({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel,
  footer,
}: {
  label: ReactNode;
  description?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel: string;
  footer?: ReactNode;
}) {
  return (
    <div className="cx-pane__row" data-block="">
      <div className="cx-pane__row-main">
        <span className="cx-pane__row-label">{label}</span>
        {description ? <span className="cx-pane__row-description">{description}</span> : null}
      </div>
      <Textarea
        className="cx-pane__textarea"
        aria-label={ariaLabel}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {footer ? <div className="cx-pane__row-footer">{footer}</div> : null}
    </div>
  );
}

/**
 * 单行输入行（分支前缀 / 自动删除限制这类短值）。
 *
 * ★ 2026-10-16：`suffix` 必须放在**定宽包裹层之外**。
 *   包裹层是 `width:<N>px` + 内层 `.cx-input { width: 100% }`，把按钮/单位塞进去
 *   会让内容宽度 = N + gap + 按钮，直接顶出卡片右缘（实测：模型与 API 的「输出上限」
 *   后缀被裁；同样的隐患也在「Python 解释器」「任务并发上限」两行的按钮上）。
 *   所以后缀与输入框是**兄弟节点**，共同组成行内动作组。
 */
export function PaneInputRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  ariaLabel,
  width = 220,
  suffix,
}: {
  label: ReactNode;
  description?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  width?: number;
  suffix?: ReactNode;
}) {
  return (
    <PaneRow
      label={label}
      description={description}
      control={
        <span className="cx-pane__row-actions">
          <span className="cx-pane__input-group" data-fixed-width="" style={{ width }}>
            <Input
              className="cx-pane__input"
              size="sm"
              aria-label={ariaLabel}
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          </span>
          {suffix}
        </span>
      }
    />
  );
}

/** 危险操作确认（官方有确认弹窗的行：worktrees 自动删除、archived 删除、memory 删除全部…） */
export function PaneConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  danger,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent
        title={title}
        description={description}
        footer={
          <>
            <AlertDialogCancel asChild>
              <Button size="sm" variant="ghost" color="secondary">
                {cancelLabel}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button size="sm" variant="solid" color={danger ? "danger" : "primary"} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogAction>
          </>
        }
      />
    </AlertDialog>
  );
}

/** 命名键值编辑器（环境变量、听写词典…）：每行 key/value + 删除，底部「添加」 */
export function PaneKeyValueList({
  entries,
  keyLabel,
  valueLabel,
  onChange,
  addLabel,
  emptyLabel,
}: {
  entries: { id: string; key: string; value: string }[];
  keyLabel: string;
  valueLabel: string;
  onChange: (entries: { id: string; key: string; value: string }[]) => void;
  addLabel: string;
  emptyLabel?: string;
}) {
  return (
    <div className="cx-pane__kv">
      {entries.length === 0 ? <p className="cx-pane__kv-empty">{emptyLabel ?? addLabel}</p> : null}
      {entries.map((entry) => (
        <div key={entry.id} className="cx-pane__kv-row">
          <Input
            size="sm"
            className="cx-pane__input cx-pane__kv-key"
            aria-label={keyLabel}
            value={entry.key}
            onChange={(event) =>
              onChange(
                entries.map((item) => (item.id === entry.id ? { ...item, key: event.target.value } : item)),
              )
            }
          />
          <Input
            size="sm"
            className="cx-pane__input cx-pane__kv-value"
            aria-label={valueLabel}
            value={entry.value}
            onChange={(event) =>
              onChange(
                entries.map((item) => (item.id === entry.id ? { ...item, value: event.target.value } : item)),
              )
            }
          />
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
          >
            删除
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="soft"
        color="secondary"
        onClick={() => onChange([...entries, { id: newPaneId(), key: "", value: "" }])}
      >
        {addLabel}
      </Button>
    </div>
  );
}
