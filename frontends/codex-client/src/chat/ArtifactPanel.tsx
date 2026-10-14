import { useState } from "react";

import { CodexChevronDown, CodexFileText, CodexGlobe, CodexPaperclip } from "@/icons";
import type { Conversation } from "@/lib/types";

/**
 * 会话右侧的「输出内容 / 来源」浮层卡片（audit #67 #68，P0）。
 *
 * 逐项实测出处：captures/blocks-conversation.json（@1280×816，参考端采集时会话右侧就是这张卡）
 *   浮层容器  [968,104 **308×700**]  `pointer-events-none z-40 absolute
 *             top-(--thread-floating-content-top-inset) right-0 bottom-(--thread-floating-content-bottom-inset)`
 *             → 上/下各内缩 8px（96+8=104 / 812−8=804）
 *   卡片      [968,114 …300×**152**]（首个 section 帧）：
 *             `rounded-2xl bg-surface-elevated-secondary electron:elevation-prominent group/summary-panel
 *               relative flex max-h-full min-h-0 flex-col overflow-hidden`
 *             bg **rgb(45,45,45)**  br **20px** cs superellipse(1.5)
 *             shadow `rgba(255,255,255,.157) 0 0 0 .5px, rgba(0,0,0,.04) 0 3px 7.5px 0, rgba(0,0,0,.05) 0 0 20px 0`
 *   内层      `flex flex-col gap-2 py-2.5` → gap **8px** / padding **10px 0**
 *   section   [968,114 300×**66**]  `pb-2`（8px）；最后一条 `last:pb-0`
 *             分隔线 `after:absolute after:bottom-0 after:h-[0.5px] after:bg-border after:inset-x-5`
 *                    → 0.5px、左右各内缩 20px、末条隐藏
 *   header    [968,114 300×**28**] `sticky top-2 z-10 flex h-7 w-full min-w-0 items-center
 *             justify-start gap-2 pb-0.5 text-sm ... ps-5 pe-3.5`
 *             → 高 28 / padding **0 14px 2px 20px** / gap **8px** / **13px / 18.5714px / 400**
 *             / 色 `color(srgb 0.87451 0.87451 0.87451 / 0.65)`；bg = 卡片色（sticky 遮罩）
 *   折叠钮    [984.5,115.71875 **237.5×22.5625**]（audit #67）
 *             `group/section-toggle -ms-[3.5px] inline-flex min-w-0 flex-1 cursor-interaction
 *               items-center gap-1.5 rounded-xl py-0.5 ps-[3.5px] pe-1 text-start`
 *             → margin-inline-start **-3.5px**、padding **2px 4px 2px 3.5px**、gap **6px**、
 *               br **15px**、flex 1
 *             内部 span（truncate）[988,117.72 52×18.5625]
 *     头部动作  [1230,115 **24×24**] padding 4px 0、br 10px（每段 1 个，aria = 该段标题）
 *   条目行    [988,144 **260×28**]（audit #68）`min-h-[28px] px-5 gap-0.5` 内
 *             → 高 **28**、padding **4px 0**、gap **4px**、br **7.5px**、
 *               色 `oklab(0.903646 … / 0.4)` = rgb(223,223,223)@40%
 *             行容器 `relative z-0 overflow-hidden` margin-top **2px**，
 *             其内 `flex flex-col gap-0.5` padding **0 20px** → 260 = 300 − 40 ✓
 *   高度账    10 + 66 + 8 + 58 + 10 = **152** ✓（第二节无 pb：28 + 2 + 28 = 58）
 *
 * 两段标题与条目文案实测：section 1「输出内容」→「创建文件或站点」；section 2「来源」→「附加文件或连接应用」。
 * ⚠️ 参考端采集帧里两段都是**展开态**（可见条目行）；折叠行为与折叠态几何**未实测**，
 *    这里按 section-toggle 的语义实现（点击收起/展开），条目行默认展开。
 */
const SECTIONS = [
  { id: "outputs", title: "输出内容", row: "创建文件或站点", Icon: CodexFileText },
  { id: "sources", title: "来源", row: "附加文件或连接应用", Icon: CodexPaperclip },
] as const;

export function ArtifactPanel({ conversation }: { conversation?: Conversation }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    outputs: true,
    sources: true,
  });

  return (
    <aside
      aria-label={conversation ? `会话浮层 · ${conversation.title}` : "会话浮层"}
      className="cx-artifact"
    >
      <div className="cx-artifact__card">
        <div className="cx-artifact__sections">
          {SECTIONS.map(({ id, title, row, Icon }) => {
            const expanded = openSections[id] ?? true;
            return (
              <section className="cx-artifact__section" key={id}>
                <header className="cx-artifact__head">
                  <button
                    aria-expanded={expanded}
                    className="cx-section-toggle"
                    onClick={() => setOpenSections((s) => ({ ...s, [id]: !(s[id] ?? true) }))}
                    type="button"
                  >
                    <span className="cx-section-toggle__label">{title}</span>
                    <CodexChevronDown
                      aria-hidden
                      className="cx-section-toggle__chevron"
                      data-open={expanded}
                      size={16}
                    />
                  </button>
                  <div className="cx-artifact__head-actions">
                    <button aria-label={row} className="cx-artifact__head-action" type="button">
                      <CodexGlobe aria-hidden size={16} />
                    </button>
                  </div>
                </header>
                {expanded ? (
                  <div className="cx-artifact__rows">
                    <div className="cx-artifact__rows-inner">
                      <button className="cx-artifact__row" type="button">
                        <Icon aria-hidden className="cx-artifact__row-icon" size={16} />
                        <span className="cx-artifact__row-label">{row}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
