import { useState } from "react";

import { CHAT_MODELS, DEFAULT_MODEL_ID, MAX_EFFORT } from "./options";

export type ChatStatus = "idle" | "streaming";

/** 输入区里可切换的芯片状态（模型 / 强度），本地保存。
 *
 * 数据源：./options 的 CHAT_MODELS。
 * 默认档 = 参考端采集时的当前档：模型「5.6 Sol」+ 强度「Ultra」，
 * 出处 captures/blocks-chat-home.json（芯片 107.03125×28 / 85.333×28）。
 */
export function useComposerSelection() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [effort, setEffort] = useState<string>(MAX_EFFORT);

  const model = CHAT_MODELS.find((m) => m.id === modelId) ?? CHAT_MODELS[0];

  return {
    model,
    modelId,
    setModelId,
    effort,
    setEffort,
  };
}
