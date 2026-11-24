import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 工作区标题栏（对应官方 header._ApplicationMenuPageHeader_ + _Toolbar_）。
 *
 * 实测（captures/blocks-chat-home.json）：
 *   header   [340,44 **936×52**]   --app-shell-header-height = calc(.25rem × 13) = 52px
 *   toolbar  [346,44 890×52]       padding `0 6px 0 8px`  gap 8px  justify-between
 *   动作组   [1236,44 40×52]       内层 32 宽：padding-right 4px + gap 6px + 一个 **28×28** 按钮
 *                                  r 12.5px cs SE1.5 色 rgba(255,255,255,.498)
 *
 * 首页态里 toolbar 只有右侧动作；会话态多一个左侧标题。
 * （标题字号 SPEC 未测：官方会用 text-base = 14px 一档，这里按 14px/21px/430 落地并标注为未实测项。）
 */
export function WorkspaceHeader({
  actions,
  className,
  leading,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  leading?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <header className={cn("codex-workspace-header", className)} data-codex-workspace-header="">
      <div className="codex-workspace-header__toolbar">
        <div className="codex-workspace-header__title">
          {leading}
          {title}
        </div>
        {actions ? <div className="codex-workspace-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
