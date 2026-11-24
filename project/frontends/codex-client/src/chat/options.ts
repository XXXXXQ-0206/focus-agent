import type { ModelOption } from "@/lib/types";

/**
 * 对话面模型与强度选项。
 *
 * 文案与顺序**逐字**来自参考端实测：
 *   · 模型 7 项（「6 Astra / 6 Sol / 6 Luna / 5.6 Sol / 5.6 Terra / 5.6 Luna / 5.5」）
 *     出处 captures/views-model-picker.json group=overlays selector=[role=menu] 的 `text` 字段：
 *     「…使用左右方向键调整强度选择模型已锁定，打开访问权限选项默认推荐模型集6 Astra6 Sol6 Luna
 *       5.6 Sol5.6 Terra5.6 Luna5.5」
 *     → 与 docs/FIDELITY-AUDIT.md #124 的解析一致（7 个模型 + 2 个分组标题）。
 * [task-76] 7 个模型的展开态几何**已可查**（官方 `_ModelList_1d00n_10`，出处与取值见 chat.css 同段注释）⇒ 不再是「查无出处」；
 *   但参考端采到的仍是折叠态 254×84，展开态**未在真机上量过**。
 */

/** effort 强度档（9 档）：出处 views-chat-home.json 的 chip 内 text
 *  「选择模型5.6 SolUltra无极低轻度中高极高MaxUltra持续」→ 无/极低/轻度/中/高/极高/Max/Ultra/持续 */
export const EFFORT_LEVELS = ["无", "极低", "轻度", "中", "高", "极高", "Max", "Ultra", "持续"] as const;

/** 最高功率档：官方 CSS raw/b9jvu.css:15 `[data-max-effort=true]{color:var(--color-chart-purple)}`
 *  + $运行端 token --color-chart-purple = #ad7bf9。参考端芯片当前档就是「Ultra」，截图 ref-06 呈紫色。 */
export const MAX_EFFORT = "Ultra";

/**
 * 真实服务商的强度档（Focus 用）：DeepSeek 实测接受 low / high / max；
 * 「默认」= 不发送 reasoning_effort，由模型自己决定。
 */
export const PROVIDER_EFFORT_LEVELS = ["默认", "low", "medium", "high", "xhigh", "max"] as const;
const DEEPSEEK_EFFORT_LEVELS = ["默认", "low", "high", "max"] as const;

/** 按档案端点/模型选择可安全发送的强度档。 */
export function providerEffortLevels(
  profile?: {
    base_url?: string;
    format?: string;
    model?: string;
  } | null,
): readonly string[] {
  const identity = [profile?.base_url, profile?.format, profile?.model].filter(Boolean).join(" ");
  return /deepseek/i.test(identity) ? DEEPSEEK_EFFORT_LEVELS : PROVIDER_EFFORT_LEVELS;
}

/** 模型面板里的 7 个模型。default = 参考端实测当前档（芯片文字「5.6 Sol」+ effort「Ultra」）。 */
export interface ChatModelOption extends ModelOption {
  /** 是否属于「默认推荐模型集」分组 */
  recommended?: boolean;
  /** 该项是否是参考端采集时的当前档 */
  current?: boolean;
}

export const CHAT_MODELS: ChatModelOption[] = [
  { id: "astra-6", label: "6 Astra", recommended: true },
  { id: "sol-6", label: "6 Sol", recommended: true },
  { id: "luna-6", label: "6 Luna", recommended: true },
  { id: "sol-56", label: "5.6 Sol", effort: MAX_EFFORT, recommended: true, current: true },
  { id: "terra-56", label: "5.6 Terra", recommended: true },
  { id: "luna-56", label: "5.6 Luna", recommended: true },
  { id: "sol-55", label: "5.5", recommended: true },
];

/** 默认档 = 参考端采集时的当前档 */
export const DEFAULT_MODEL_ID = CHAT_MODELS.find((m) => m.current)?.id ?? CHAT_MODELS[0].id;
