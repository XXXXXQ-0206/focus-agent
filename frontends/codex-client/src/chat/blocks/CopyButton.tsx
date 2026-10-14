import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { CodexCopy } from "@/icons";
import { CheckmarkLgLight12 } from "./icons";

/**
 * 复制按钮（SPEC §4.5 / §6.1 / §11.5）
 * ============================================================================
 * ✅ 图标：`CodexCopy`（官方 `square-on-square-light-16` 的自定义内联等价，21×21，SPEC §4.5）
 * ✅ 文案：aria-label = `复制` / `已复制`（`copyButton.copyAriaLabel` / `copiedAriaLabel`）
 * ✅ 按钮尺寸：文件卡实测 **23×23**（SPEC §6.1）；命令块类名 `p-0.5` 会给出 25×25，
 *    两处不一致 —— 取实测 23×23（`--radius-md` 10px 圆角）
 * ✅ 显隐动效：`transition-opacity duration-basic` = **150ms**（SPEC §4.2 / §4.6，shell-shared.css:2981）
 * ⚠️ 复位延迟：SPEC §11.3「inline 变体 1000ms 后复位，其它变体 2000ms」→ 由 resetMs 参数决定
 * ⚠️ 成功态图标：SPEC §11.5 标 `checkmark-md-light-16`（推断）→ 这里复用本目录的 12px 勾
 *    （更接近"勾"的语义），并在文档里说明「成功态图标为推断」。
 */
export function CopyButton({
  className,
  copiedIcon,
  label = "复制",
  resetMs = 2000,
  text,
}: {
  className?: string;
  /** 已复制态图标；缺省 = 本目录 12×12 勾（SPEC §11.5 说代码块是 checkmark-md-light-16，推断） */
  copiedIcon?: ReactNode;
  label?: string;
  resetMs?: number;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 无剪贴板权限（非安全上下文 / 无焦点）时退化，仍给出反馈
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), resetMs);
  }, [resetMs, text]);

  return (
    <button
      aria-label={copied ? "已复制" : label}
      className={className}
      data-copied={copied ? "true" : "false"}
      onClick={copy}
      title={copied ? "已复制" : label}
      type="button"
    >
      {copied ? (copiedIcon ?? <CheckmarkLgLight12 />) : <CodexCopy size={21} />}
    </button>
  );
}
