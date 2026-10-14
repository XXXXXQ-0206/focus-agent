import { motion } from "motion/react";
import { type ReactNode, useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { DisclosureChevron20 } from "./icons";
import type { ActivityStatus } from "./types";

/**
 * 通用块骨架 + 折叠展开（SPEC §2，**完整实测**：116 个块头一致）
 * ============================================================================
 * 官方来源：`tool-activity-disclosure-905d1c76fb3d.js` + `timeline-activity-body-5bbc638e9ce3.js`
 *
 * DOM（SPEC §2.1）：
 *   div.group/activity-header.relative.inline-flex.min-w-0.max-w-full.self-start.items-center.gap-1
 *   ├─ button.absolute.inset-0 [aria-labelledby=<summary id>][aria-expanded]   ← 整行即点击区
 *   └─ span#<summary id>.inline-flex.min-w-0.gap-1.5.items-center.shrink.truncate
 *      ├─ span.contents.text-text/60 → svg 16×16
 *      ├─ span.min-w-0.flex-1.truncate → 摘要
 *      └─ span.pointer-events-none.relative.flex → svg 20×20 折叠箭头
 *
 * 状态机（SPEC §2.2，逐字；本次回到官方包字节码复核）：
 *   isExpanded = hasChildren && (status === 'running' ? !manuallyCollapsed : userExpanded)
 *   onToggle:  expanded || onExpand?.()          // 正在展开时通知调用方
 *              status === 'running' ? setManuallyCollapsed(!c) : setUserExpanded(!e)
 *   → running 自动展开；完成后回到用户手动态（默认折叠，点开过就一直开着）
 *
 * ★ 两档语义（R4 之后）：**受控档**与**状态机档**。默认走状态机档（上面那台，官方
 *   tool-activity-disclosure 的原样复刻）；传了 `expanded`/`onToggle` 就走受控档 ——
 *   展开态完全由调用方持有，本组件既不参与决策、也不看 status。官方 exec 卡（sites-end-resource 的
 *   `Jx`：`useState("collapsed")` + 只由用户点击改 + 把 {expanded,onToggle} 直接交给块头骨架）
 *   就是受控档的形态，见下面 ActivityDisclosureProps 的 `expanded` 注释与 docs/RULINGS.md R4。
 *
 * ★ 展开态的「派生 vs 挂载取值」（OPEN-ITEMS #7 的收口）：
 *   官方 userExpanded 初值 = 挂载时的 defaultExpanded，且官方**从不传**该 prop（16 个 importer
 *   的全部调用点已扫，0 命中）⇒ 恒 false。本工程 adapter 传的是 status 派生值，所以我们必须
 *   让展开态跟随 status 迁移重新求值 —— 详见下面 useState 处的长注释。
 *
 * 动效（SPEC §2.2 / §4.6）：正文是 framer-motion `motion.div`，`initial={false}`，
 *   `animate={{height: 实测像素高, opacity: 0|1}}`，展开 `overflow-visible`、折叠 `overflow-hidden`。
 *
 * ⚠️ 未实测（SPEC §13.11）：共享 easing 的 **duration 数值**未解出。
 *    这里用 `--cubic-enter = cubic-bezier(.19,1,.22,1)`（SPEC §2.3 有出处）+ 200ms（推断）。
 * ⚠️ 折叠态：官方给正文 `aria-hidden + inert`（SPEC §2.1）；官方推理块还会**卸载**正文
 *    （SPEC §3.2 的 `expanded ? <Scroller/> : null`）。本实现保持挂载，否则无法测量展开目标高度；
 *    不可见 + `inert` 的可达性语义等价。
 */

/** ⚠️ 推断，未实测：SPEC §13.11 明说 duration 未解出；只确证了 easing 曲线（--cubic-enter）。 */
export const DISCLOSURE_TRANSITION = { duration: 0.2, ease: [0.19, 1, 0.22, 1] } as const;

export interface ActivityDisclosureProps {
  /** 状态：决定自动展开与摘要样式（SPEC §2.2） */
  status: ActivityStatus;
  /** 官方块根上的 data-local-conversation-item-target-ids（SPEC §2.1），缺省不输出 */
  itemId?: string;
  /** [SPEC §6.1] 逐文件头用的是 button[aria-label]，而不是 aria-labelledby */
  ariaLabel?: string;
  /** [SPEC §3.2] 推理块摘要是 text-text/30；默认走实测的 text-text/60 */
  summaryTone?: "default" | "dim";
  /** 摘要内容（块头可访问名就是它，SPEC §2.1 的 aria-labelledby） */
  summary: ReactNode;
  /** 16×16 类型图标（各块图标出处见对应文件） */
  icon?: ReactNode;
  /** running 时摘要走 shimmer（官方 `ActiveText active={true}`，SPEC §3.6） */
  active?: boolean;
  /** 没有正文的块不渲染折叠箭头（SPEC §2.1：hasChildren） */
  hasBody?: boolean;
  /** 状态机档的初值：官方 userExpanded 的挂载取值（官方调用点从不传，见下面长注释） */
  defaultExpanded?: boolean;
  /**
   * **受控档**（官方 exec 卡 `Jx` 的形态，R4）：给定时本组件**完全绕过**状态机 ——
   * `aria-expanded` / 正文高度就是这里的值，切换只走 `onToggle`，与 status 无关。
   * 不传（undefined）= 走状态机档（工具活动卡的 running 自动展开等，SPEC §2.2）。
   * ⚠️ 用 `undefined` 判档而不是布尔默认值：`expanded={false}` 是「受控且折叠」，
   * 不能与「没传」混为一谈。
   */
  expanded?: boolean;
  /** 受控档的切换回调（用户点了块头） */
  onToggle?: () => void;
  /** SPEC §2.1 的正文容器两档：default = gap 8px + pt-2 pb-1；grouped = gap 4px + pt-1 */
  bodyVariant?: "default" | "grouped";
  /** SPEC §2.1：indent 默认 true → 正文 ps-6 */
  indent?: boolean;
  /** SPEC §2.1：块间距档（item 16px / grouped 4px），用于渲染分组间隔 div */
  spacing?: "item" | "grouped";
  /** SPEC §6.1：文件卡等块自带 `overflow-clip rounded-lg` */
  clipBody?: boolean;
  bodyClassName?: string;
  onExpand?: () => void;
  /**
   * 块头**右侧**的动作按钮组（如计划卡的 Download / Open-in-side-panel / Expand）。
   *
   * 官方计划卡（plan-summary-item-content-4662a5050d5a.js）把这一组渲染成
   * `div.relative.z-20.flex.items-center.gap-1`，与摘要同处 group/activity-header 内 ——
   * `relative z-20` 正是为了压在块头那个 `absolute inset-0` 的整行点击区之上。
   * 不传 = 不渲染（其它块的静态 DOM 与像素完全不变）。
   */
  headerActions?: ReactNode;
  children: ReactNode;
}

export function ActivityDisclosure({
  status,
  itemId,
  ariaLabel,
  summaryTone = "default",
  summary,
  icon,
  active = false,
  hasBody = true,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  bodyVariant = "default",
  indent = true,
  spacing = "item",
  clipBody = false,
  bodyClassName,
  onExpand,
  headerActions,
  children,
}: ActivityDisclosureProps) {
  const generatedId = useId();
  const summaryId = `cx-activity-summary-${generatedId.replace(/:/g, "")}`;
  /**
   * 用户手动态。**不是** useState(defaultExpanded)，理由（官方证据 + 我们自己的偏差）：
   *
   * 官方 tool-activity-disclosure-905d1c76fb3d.js 的函数 x，字节码逐字：
   *   p = defaultExpanded !== void 0 && defaultExpanded;   // 未传 ⇒ false
   *   [_, v] = useState(false);                            // manuallyCollapsed
   *   [y, b] = useState(p);                                // userExpanded ← 只在挂载读一次
   *   O = hasChildren && (running ? !_ : y)
   * 而官方**没有任何调用点**传 defaultExpanded：全量扫 19236 个 asset，只有 12 个文件出现该字面量，
   * 其中 import tool-activity-disclosure 的 16 个文件一个都没有（唯一例外
   * sites-end-resource-ecc479065e0b.js@13490 属于另一个组件 xg/CollapsedTurnDisclosure 的形参）。
   * 直接调用点共 8 处（agent-activity-item / local-conversation-sources / mcp-tool-item / sites-end-resource
   * 四个文件），全部是 {icon, status, summary, children} 形态，没有一处传 defaultExpanded
   * ⇒ 官方 userExpanded 恒从 false 起步，完成后自然折叠。
   *
   * 本工程里的两个消费档（R4 之后）：
   *   · **exec / terminal 卡**（官方 Jx，同渲染 data-testid="exec-shell-body"）走**受控档**：
   *     展开态在块组件自己的 useState 里，恒从 collapsed 起步、只由用户点击改，本组件不参与决策；
   *   · 其余块走**状态机档**，这里的 userExpanded 定义成「用户对**当前 status** 的表态」：
   *     status 一迁移就回落到该 status 对应的 defaultExpanded（= 官方可观测行为，修 #7 那一条）。
   *     用 render 期派生而不是 useEffect，避免完成瞬间闪一帧展开。
   *   （旧注释说 "block-adapter 传的 defaultExpanded 是 status 派生的" —— 那是 R4 之前的行为，
   *     适配层已不再为 exec 派生它，见 block-adapter.ts 的 exec 分支与 docs/RULINGS.md R4。）
   */
  const [userChoice, setUserChoice] = useState<{ status: ActivityStatus; expanded: boolean } | null>(null);
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const running = status === "running";
  const userExpanded = userChoice?.status === status ? userChoice.expanded : defaultExpanded;
  /**
   * 受控档：`expanded` 传了就以它为准，**完全不看 status**（官方 exec 卡 Jx 的语义 ——
   * 它的展开态是一个与 status 无关的 useState，只有用户点击会改它）。
   */
  const controlled = controlledExpanded !== undefined;
  /** 状态机档的展开态：running 自动展开、完成档回到用户手动态（官方 tool-activity-disclosure 逐字） */
  const machineExpanded = running ? !manuallyCollapsed : userExpanded;
  /** 受控档给什么就是什么（**不看 status**）；状态机档才走上面那条派生 */
  const expanded = hasBody && (controlled ? controlledExpanded : machineExpanded);

  // 展开目标高度 = 正文自然高度（SPEC §2.2 的"实测像素高"）
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const measure = () => setContentHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toggle = useCallback(() => {
    if (expanded) onExpand?.();
    // 受控档：本组件不持有展开态，交回调用方（官方 Jx 的 `onToggle`）
    if (controlled) {
      onToggle?.();
      return;
    }
    // running 档改 manuallyCollapsed、完成档改 userExpanded（官方逐字；两档互不干扰）
    if (running) setManuallyCollapsed((collapsed) => !collapsed);
    else setUserChoice({ expanded: !expanded, status });
  }, [controlled, expanded, onExpand, onToggle, running, status]);

  return (
    <div
      className={cn("cx-block", clipBody && "cx-block--clip")}
      data-local-conversation-item-target-ids={itemId}
      data-spacing={spacing}
      tabIndex={-1}
    >
      <div className="cx-block__col">
        <div className={cn("cx-activity-header", clipBody && "cx-activity-header--clip")}>
          <button
            aria-expanded={expanded}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : summaryId}
            className="cx-activity-header__button"
            onClick={toggle}
            type="button"
          />
          <span className="cx-activity-header__summary" id={summaryId}>
            {icon ? <span className="cx-activity-header__icon">{icon}</span> : null}
            <span className="cx-activity-header__text">
              <span
                className="cx-activity-header__label"
                data-active={active ? "true" : "false"}
                data-tone={summaryTone}
              >
                {summary}
              </span>
            </span>
            {hasBody ? (
              <span className="cx-activity-header__chevron">
                <DisclosureChevron20 />
              </span>
            ) : null}
          </span>
          {headerActions ? <span className="cx-activity-header__actions">{headerActions}</span> : null}
        </div>
        {hasBody ? (
          <motion.div
            animate={{ height: expanded ? contentHeight : 0, opacity: expanded ? 1 : 0 }}
            aria-hidden={!expanded}
            className={cn("cx-disclosure", expanded ? "is-expanded" : "is-collapsed", bodyClassName)}
            inert={!expanded}
            initial={false}
            style={{ pointerEvents: expanded ? "auto" : "none" }}
            transition={DISCLOSURE_TRANSITION}
          >
            <div
              className={cn(
                "cx-disclosure__content",
                bodyVariant === "grouped"
                  ? "cx-disclosure__content--grouped"
                  : "cx-disclosure__content--default",
                indent && "cx-disclosure__content--indent",
              )}
              ref={contentRef}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </div>
      {spacing === "grouped" ? <div aria-hidden className="cx-activity-gap" /> : null}
    </div>
  );
}
