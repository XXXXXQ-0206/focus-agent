import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./settings.css";

/**
 * 设置卡片。
 *
 * SPEC §2.1 实测（卡片 rect 439,233 728×154）：
 *   · bg **rgb(35,35,35)**、圆角 **20px**
 *   · **有发丝边框**：1 设备像素（dpr1.5）—— 官方 token --border-width-hairline = .5px
 *     （shell-shared.css:2938），色 rgba(255,255,255,.082)（SPEC §2.1 / §7.3）。
 *     证据交叉验证：卡内容 728 − 0.5×2 = **727 = 实测行宽**，行 x=440 = 卡 x=439 + 0.5。
 *   · **padding: 0** —— 内距由每一行自己带（行 padding 12px 16px，SPEC §2.1）。
 *     非行内容（预览、表单块）请用 SettingsCardBody 包一层拿回 16px 内距。
 */
export function SettingsCard({
  children,
  className,
  divided = true,
}: {
  children: ReactNode;
  className?: string;
  /** 相邻行之间是否加发丝分隔线（官方卡片默认有；SPEC §2.1 只说分隔线本身未逐像素实测） */
  divided?: boolean;
}) {
  return (
    <div className={cn("cx-settings-card", className)} data-divided={divided ? "" : undefined}>
      {children}
    </div>
  );
}

/** 卡片内的非行内容（16px 内距 = 官方卡片内距） */
export function SettingsCardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("cx-settings-card__body", className)}>{children}</div>;
}

/**
 * 分区（SPEC §2.1）：
 *   section           439,187 728×200
 *   分区标题行        728×**46**（padding-bottom 6px）；标题文字 **14px/500/21**
 *   卡片              紧贴标题行，无额外间距 → 分区间距由列容器的 gap **40px** 提供
 */
export function SettingsSection({
  title,
  tag,
  children,
}: {
  title: string;
  /** 标题行右侧的徽标（「附加」等） */
  tag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cx-settings__section">
      <div className="cx-settings__section-head">
        <h2 className="cx-settings__section-title">{title}</h2>
        {tag}
      </div>
      {children}
    </section>
  );
}

export interface SettingsRowProps {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** 控件另起一行（长控件 / 表单 / 预览用） */
  block?: boolean;
  className?: string;
}

/**
 * 设置行。
 *
 * SPEC §2.1 / §7.1 实测，**真值是未取整读数**（SPEC 原记 61 / 44 / 77 / 93 是 E2 采集器的整数取整，
 * 更正依据 docs/FORENSICS-F1-F2-F3.md「F2 收口」+ src/settings/EVIDENCE.md §6）：
 * 官方常规页行高 **60.5625 ×22 / 92.5625 / 44 / 76.5625**，**没有一行是 64** ——
 * 所以这里**不写死 min-height**，改成「padding 12px 16px + 内容自适应」：
 *   · 单行（标签 18.5625 + 说明 16 + gap 2）→ 12+36.5625+12 = **60.5625** ✓
 *   · 无说明 + 开关（开关 20 高于标签 18.5625）→ 12+20+12 = **44** ✓
 *   · 说明多一行 → 60.5625+16 = **76.5625** ✓；多两行 → 60.5625+32 = **92.5625** ✓
 * 行内：标签 **13px/500/18.5625**（computed line-height 18.5714px = 13px × calc(1.25 / 0.875)）、
 * 说明 **12px/430/16 · 白 65%**、列间 gap **24px**、标签列最宽 **510.667**（实测标签块 510.667×18.5625）。
 * 旧实现用的 --height-token-settings-row: 4rem（shell-shared:2946）属**另一套**设置行，
 * 见 SPEC §7.1 —— 它仍由 store 的 density 档位驱动，但不再是设置行的高度来源。
 */
export function SettingsRow({ label, description, control, block, className }: SettingsRowProps) {
  return (
    <div className={cn("cx-settings-row", className)} data-control-block={block ? "" : undefined}>
      <div className="cx-settings-row__main">
        <span className="cx-settings-row__label">{label}</span>
        {description ? <span className="cx-settings-row__description">{description}</span> : null}
      </div>
      {control ? <div className="cx-settings-row__control">{control}</div> : null}
    </div>
  );
}
