import { EFFORT_LEVELS, MAX_EFFORT } from "./options";

/**
 * 模型胶囊内的 effort 视口（#125，P1）。
 *
 * 官方 CSS 原文（reconstruct/overlays/raw/b9jvu.css:8-15）：
 *   ._ModelPickerTriggerEffortLabel, ._ModelPickerTriggerEffortViewport {
 *     margin: calc(var(--blur-xs) * -1); padding: var(--blur-xs); overflow: hidden }
 *   ._ModelPickerTriggerEffortLabel {
 *     box-sizing: content-box; color: var(--daybreak-muted, var(--color-text-tertiary));
 *     white-space: nowrap; mask-image: linear-gradient(to right, black calc(100% - 4px), transparent);
 *     flex-shrink: 0; display: block; position: relative }
 *   ._ModelPickerTriggerEffortViewport {
 *     mask-image: linear-gradient(to right, transparent, black 4px);
 *     justify-content: center; display: flex }
 *   ._ModelPickerTriggerEffortLayers { flex-shrink: 0; grid-template-columns: max-content;
 *     width: max-content; display: grid }
 *   ._ModelPickerTriggerEffortText { opacity: 0; width: max-content; filter: blur(var(--blur-xs));
 *     will-change: opacity, filter; grid-area: 1 / 1; justify-self: center }
 *   ._ModelPickerTriggerEffortText[data-max-effort=true] { color: var(--color-chart-purple) }
 *
 * 实测（captures/blocks-chat-home.json）：
 *   EffortLabel   1072.04,761 **35.625×26**，内容盒 27.625×18，pad 4 / margin -4
 *   EffortViewport 同 rect（两者同盒）
 * 我们旧实现是 27.63×18 的单行文字（audit #125 实测值）。这里补上 26px 视口层：
 *   外盒 35.625 = 文字 27.625 + 左右各 4（padding），而 margin -4 抵掉 → **芯片宽度不变**（107.031）。
 *   高度 26 = 行高 18 + 上下各 4（实测 chip 内 line-height 18px）。
 *
 * 根元素保留旧的 `.cx-chip__effort` 类名，避免 audit 的 [C22]/[C23] 命令取不到值。
 */
export function EffortViewport({
  value,
  levels = EFFORT_LEVELS,
  maxLevel = MAX_EFFORT,
}: {
  value?: string;
  /** 可选的档位集合（Focus 用真实档 low/high/max，见 options.ts） */
  levels?: readonly string[];
  /** 最高档的标签（用于紫色高亮） */
  maxLevel?: string;
}) {
  const current = value ?? maxLevel;
  return (
    <span className="cx-chip__effort cx-effort">
      <span className="cx-effort__viewport">
        <span className="cx-effort__layers">
          {levels.map((level) => (
            <span
              className="cx-effort__text"
              data-active={level === current}
              data-max-effort={level === maxLevel}
              key={level}
            >
              {level}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
