import { CodexPencil } from "@/icons";
import { CopyButton } from "./CopyButton";
import { DiffFallback, DiffLines } from "./DiffBlock";
import { ActivityDisclosure } from "./Disclosure";
import { RollingNumber } from "./RollingNumber";
import type { FileChangeNode, FileEditNode } from "./types";
import { useScrollFadeMask } from "./use-scroll-fade";

/**
 * 文件读取 / 写入 / 编辑块（SPEC §6，**完整实测**：39 个编辑块）
 * ============================================================================
 * 官方 DOM（SPEC §6.1）：
 *   header（pencil-light-16 + 摘要）                       ← 复用 §2 骨架
 *   └─ div.-ms-2.ps-2
 *      └─ div.vertical-scroll-fade-mask.-ms-2.flex.max-h-56.flex-col
 *            .overflow-x-hidden.overflow-y-auto.ps-2.[--edge-fade-distance:1.5rem]
 *         └─ 逐文件：div.flex.flex-col.overflow-clip.rounded-lg
 *            ├─ header（button[aria-label="切换 <file> 的差异视图"][aria-expanded]）
 *            └─ div.overflow-visible
 *               └─ div.border-default.flex.flex-col.overflow-hidden.rounded-lg.border.mt-1.5
 *                  ├─ div.flex.items-center.justify-between.gap-2.border-b.border-default
 *                  │     .bg-background-primary-ghost-hover/60.px-2.5.py-0.5
 *                  │     .text-size-chat-sm.text-codex-description/80                （实测高 28px）
 *                  │  ├─ 文件名按钮（hover:underline）+ 增删统计（+22 / −17）
 *                  │  └─ 复制按钮（实测 23×23）
 *                  └─ div.bg-surface-tertiary > div.composer-diff-simple-line.overflow-y-auto.max-h-60  （240px）
 *
 * 数值：文件列表滚动区 max-h-56 = **224px**、渐隐 **1.5rem**、文件卡 `rounded-lg border mt-1.5`
 *      （`mt-1.5` = 6px）、diff 滚动区 **240px** —— 全部 SPEC §6.2 实测。
 *
 * ⚠️ 未实现（诚实标注）：SPEC §6.2 提到的增删数字**逐位滚动**动画
 *    （`._DigitColumn_1rr6w_1` / `transition: transform var(--transition-duration-relaxed)`）
 *    本轮未实现，只保留了 `tabular-nums`。
 * ⚠️ 推断：SPEC §6.1 的 dump 里"逐文件头"的摘要文字与分组头相同（疑为抽取器取到同一 span），
 *    这里按 SPEC §6.3 的 `codex.unifiedDiff.editedFile` = `Edited {filename}` 渲染成
 *    `已编辑 {文件名}`，**分组头**用 `editedFiles` = `已编辑 {n} 个文件`。
 */

function fileFallback(file: FileChangeNode) {
  if (file.renderFailed) return <DiffFallback state="failed" text="Diff failed to render" />;
  if (file.binary) return <DiffFallback state="binary" text="Binary file not shown" />;
  if (file.renamedWithoutChanges) return <DiffFallback state="renamed" text="File renamed without changes" />;
  if (file.tooLarge) return <DiffFallback state="tooLarge" text="Too large to render inline" />;
  return null;
}

export function FileChangeCard({ file }: { file: FileChangeNode }) {
  const fallback = fileFallback(file);
  return (
    <ActivityDisclosure
      ariaLabel={`切换 ${file.path} 的差异视图`}
      bodyVariant="default"
      clipBody
      icon={<CodexPencil size={16} />}
      indent={false}
      /* SPEC §6.1 实测该逐文件头是 aria-expanded=true → 默认展开 */
      defaultExpanded={file.defaultExpanded ?? true}
      status="completed"
      summary={
        <>
          <span className="cx-summary__action">已编辑</span>{" "}
          <span className="cx-summary__detail">{file.path}</span>
        </>
      }
    >
      <div className="cx-filecard">
        <div className="cx-filecard__head">
          <div className="cx-filecard__left">
            <button className="cx-filecard__name" type="button">
              <span className="cx-filecard__name-text">{file.path}</span>
            </button>
            {typeof file.added === "number" || typeof file.deleted === "number" ? (
              <span className="cx-filecard__stats">
                {/* 官方：+{linesAdded} / -{linesRemoved} 的数字部分是逐位滚动（RollingNumber）。
                    ⚠️ 官方还有一个 animated 开关（app-initial @7003200 的 P2i，false 时走 formatNumber 纯文本），
                       我们的数据是单次渲染、没有「旧值→新值」的过渡，故恒走滚动档并标注。 */}
                {typeof file.added === "number" ? (
                  <span className="cx-filecard__added">
                    +<RollingNumber value={file.added} />
                  </span>
                ) : null}
                {typeof file.deleted === "number" ? (
                  <span className="cx-filecard__deleted">
                    −<RollingNumber value={file.deleted} />
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          <span className="cx-filecard__copy-host">
            <CopyButton className="cx-copybtn cx-filecard__copy" text={file.path} />
          </span>
        </div>
        <div className="cx-filecard__diff">{fallback ?? <DiffLines lines={file.lines ?? []} />}</div>
      </div>
    </ActivityDisclosure>
  );
}

export function FileEditBlock({ block }: { block: FileEditNode }) {
  const { files, status } = block;
  const fade = useScrollFadeMask<HTMLDivElement>("1.5rem");
  const summary =
    block.summary ?? (files.length === 1 ? `已编辑 ${files[0].path}` : `已编辑 ${files.length} 个文件`);

  return (
    <ActivityDisclosure
      active={status === "running"}
      bodyVariant="default"
      icon={<CodexPencil size={16} />}
      indent={false}
      itemId={block.id}
      status={status}
      defaultExpanded={block.defaultExpanded ?? true}
      summary={summary}
    >
      <div className="cx-filelist">
        <div
          /* [task-55] 去掉死类名 cx-filelist__inset：全仓 CSS 从无该规则（git log -S 0 命中），
             同元素已有定义完整的 cx-filelist__scroll（负边距/内距/列向/gap/max-height/overflow）。 */
          className="cx-filelist__scroll"
          ref={fade.ref}
          style={fade.maskImage ? { maskImage: fade.maskImage } : undefined}
        >
          {files.map((file) => (
            <FileChangeCard file={file} key={file.id} />
          ))}
        </div>
      </div>
    </ActivityDisclosure>
  );
}
