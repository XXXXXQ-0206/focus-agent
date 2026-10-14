import { Popover as PopoverPrimitive, Slider as SliderPrimitive } from "radix-ui";
import { useCallback, useRef, useState } from "react";

import { CodexCheck, CodexChevronDown, CodexChevronRight, CodexLock } from "@/icons";
import { cn } from "@/lib/utils";

import { EffortViewport } from "./EffortViewport";
import { CHAT_MODELS, type ChatModelOption, EFFORT_LEVELS, MAX_EFFORT } from "./options";
import { useRovingMenu } from "./use-roving-menu";

/**
 * 模型选择器弹层（audit #123 #124，#125 的 effort 视口在 EffortViewport.tsx）。
 *
 * 参考端实测（captures/views-model-picker.json @1280×816，SPEC-OVERLAYS §1）：
 *   触发器     button[data-codex-intelligence-trigger] 1025.302,760 **107.03125×28**
 *              bg rgba(255,255,255,.08) br 9999px cs SE1(1) pad 0 8px gap 4px 13px/18px/430
 *              打开态 aria-expanded=true data-state=open data-radix-popper-side=top data-align=end
 *   popper 包装 [data-radix-popper-content-wrapper] 950,666 **256×86**（= 内容 254×84 + m-px 各 1）
 *   内容盒      role=menu aria-orientation=vertical data-radix-menu-content
 *              [role=menu] 采集帧 956.08,668.72 **248.92×82.32**（= 布局态 254×84 × 0.98 入场首帧）
 *              br **20px** cs superellipse(1.5) backdrop-filter **blur(8px)**
 *              bg oklab(0.297161 0.0000135 0.0000059 / 0.9)
 *              阴影 rgba(255,255,255,.082) 0 0 0 .5px ×2 + rgba(0,0,0,.12) 0 8px 16px -4px
 *              padding **0px**（`--app-menu-gutter: 0px`，官方 CSS raw/b9jvu.css:16）
 *   内容文本    「5.6 Sol / Ultra / 使用左右方向键调整强度 / 选择模型 / 已锁定，打开访问权限 /
 *                选项 / 默认推荐模型集 / 6 Astra / 6 Sol / 6 Luna / 5.6 Sol / 5.6 Terra /
 *                5.6 Luna / 5.5」
 *   高度账      4(_ViewPanel_ padding) + 36(_ViewControls_) + 4+32+4(_SimpleView_ 的 padding-block)
 *              + 4(_ViewPanel_ padding) = **84** ✓（SPEC-OVERLAYS §1.5 逐行实测）
 *
 * 锚定推导（实测值反算，非抄 CSS）：
 *   data-align=end 指向的是内部 254 宽的量测盒；实测内容盒中心 x = (951+1205)/2 = 1078，
 *   触发器中心 x = (1025.302+1132.333)/2 = 1078.82 → **面板水平居中于芯片**。
 *   故这里用 align="center"（等价几何），sideOffset 8：实测 popper wrapper 底 752 与
 *   触发器顶 760 差 8px（再 +1px m-px = 内容底 751）。
 *
 * [task-76] 展开态几何**已有官方出处**（不再只是折叠帧推导）：官方 `_ModelList_1d00n_10`（app-primary-c7f956fe5bad.css）
 *   给出 max-height min(316px, …) ／ padding-inline var(--spacing) ／ padding-block-end var(--spacing)；
 *   `_Menu_1d00n_1` 过渡 = 高度 .32s cubic-bezier(.19,1,.22,1)、动效 opacity .2s + translate .32s（延迟 40/56/16ms）。
 * ⚠️ 折叠态这一段推导仍有效（参考端只采到 254×84 折叠帧）：
 *    列表内容在 DOM 里但被 `overflow: hidden` 裁掉（同 innerText 可见）。本实现同构：
 *    列表始终在 DOM 中，折叠时 `data-active=false` → opacity 0（官方 raw/1d00n.css:18），
 *    面板高度钉在 84px 并裁切；点第一行「选择模型」展开（此时高度 auto）。
 */
export function ModelPickerChip({
  className,
  effort,
  model,
  onSelectEffort,
  onSelectModel,
}: {
  className?: string;
  effort: string;
  model: ChatModelOption | { id: string; label: string; effort?: string };
  onSelectEffort?: (id: string) => void;
  onSelectModel: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const onKeyDown = useRovingMenu(contentRef, close);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // 每次重新打开都回到折叠态，与参考端采集帧（254×84）一致
    if (!next) setExpanded(false);
  };

  const effortIndex = Math.max(0, EFFORT_LEVELS.indexOf(effort as (typeof EFFORT_LEVELS)[number]));

  return (
    <PopoverPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <PopoverPrimitive.Trigger asChild>
        <button
          aria-label="选择模型"
          className={cn("cx-chip cx-chip--model", className)}
          data-codex-intelligence-trigger="true"
          data-composer-navigation-target="reasoning"
          type="button"
        >
          <span className="cx-chip__value cx-chip__value--model">{model.label}</span>
          <EffortViewport value={effort} />
          <CodexChevronDown size={16} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="center"
          aria-label="选择模型"
          aria-orientation="vertical"
          className="cx-overlay cx-mp"
          data-radix-menu-content=""
          onKeyDown={onKeyDown}
          // 官方实测：打开后焦点落在 [role=menu] 容器本身（SPEC-OVERLAYS §1.7「焦点进入」），
          // 而不是第一个条目 —— 否则第一行会立刻吃到 :focus 的 ghost-hover 底色，
          // 与 reviewref-06 截图（该行无底色）不符。
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          ref={contentRef}
          role="menu"
          side="top"
          sideOffset={8}
          tabIndex={-1}
        >
          <div className="cx-mp__menu" data-expanded={expanded}>
            <div className="cx-mp__panel">
              {/* _ViewControls_1d00n_170：min-height 36 / padding-inline 8 / ::before 16px 占位 */}
              <div className="cx-mp__controls">
                <button
                  aria-expanded={expanded}
                  aria-label="选择模型"
                  className="cx-mp__toggle"
                  data-interactive="true"
                  data-model-picker-view-toggle="true"
                  onClick={() => setExpanded((v) => !v)}
                  role="menuitem"
                  type="button"
                >
                  <span className="cx-mp__toggle-content">
                    <span className="cx-mp__model-label">{model.label}</span>
                    <span
                      className="cx-mp__effort-label"
                      data-maximum={effort === MAX_EFFORT ? "true" : undefined}
                    >
                      {effort}
                    </span>
                    <CodexChevronRight className="cx-mp__toggle-icon" size={16} />
                  </span>
                </button>
              </div>

              {/* _SimpleView_1d00n_118：min-height 36 / padding-block 4 → 滑杆行 40 高、槽 32 高 */}
              <div className="cx-mp__simple">
                <SliderPrimitive.Root
                  aria-keyshortcuts="ArrowLeft ArrowRight"
                  aria-label="强度"
                  className="cx-mp__slider"
                  max={EFFORT_LEVELS.length - 1}
                  min={0}
                  onValueChange={([i]) => {
                    const next = EFFORT_LEVELS[i];
                    if (next) onSelectEffort?.(next);
                  }}
                  role="menuitem"
                  step={1}
                  tabIndex={-1}
                  value={[effortIndex]}
                >
                  <SliderPrimitive.Track className="cx-mp__slider-track">
                    <SliderPrimitive.Range className="cx-mp__slider-range" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb className="cx-mp__slider-thumb" />
                </SliderPrimitive.Root>
              </div>

              {/* _ModelListMotion_1d00n_10：margin-inline -4；折叠态 opacity 0 + translate 0 -10 */}
              <div className="cx-mp__list" data-active={expanded}>
                <p className="cx-mp__hint">使用左右方向键调整强度</p>
                <p className="cx-mp__list-title">选择模型</p>
                <div className="cx-mp__notice">
                  <CodexLock aria-hidden size={16} />
                  <span>已锁定，打开访问权限</span>
                </div>
                <p className="cx-mp__group">选项</p>
                <p className="cx-mp__group cx-mp__group--sub">默认推荐模型集</p>
                {CHAT_MODELS.map((option) => (
                  <button
                    aria-checked={option.id === model.id}
                    className="cx-mp__item"
                    key={option.id}
                    onClick={() => {
                      onSelectModel(option.id);
                      if (option.effort) onSelectEffort?.(option.effort);
                      setOpen(false);
                    }}
                    role="menuitemradio"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="cx-mp__item-label">{option.label}</span>
                    {option.id === model.id ? (
                      <CodexCheck aria-hidden className="cx-mp__item-check" size={16} />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
