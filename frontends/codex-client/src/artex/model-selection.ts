import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ComposerSelection } from "@/chat/Composer";
import { type ChatModelOption, providerEffortLevels } from "@/chat/options";

import { type ArtexAgent, artexApi } from "./api";
import type { LLMProfile } from "./types";

/**
 * 对话页输入区的**真实**模型/强度选择（2026-10-20）。
 *
 * 之前 `useComposerSelection()` 用的是参考端 mock（「5.6 Sol / Ultra」），页面上的模型
 * 与后端实际在跑的 `deepseek-flash` 毫无关系。这里把选择接到服务端：
 *   · 模型列表 = `GET /api/llm/profiles`（一个服务商档案 = 一个模型条目）
 *   · 选模型   = `POST /api/llm/profiles/active`（全局激活，Agent/对话都用它）
 *   · 强度     = 档案里的 `reasoning_effort`（deepseek-flash 实测接受 low / high / max；
 *                「默认」= 不发送，由模型自己决定）
 *
 * 强度保存走 `POST /api/llm/profiles`（整档回写）：服务端保存是**整行覆盖**，
 * 只发一个字段会把 rate/priority/retry 等清空，所以 payload 必须带齐。
 */

const DEFAULT_EFFORT = "默认";

function effortLabel(raw?: string): string {
  const value = (raw ?? "").trim();
  return value === "" ? DEFAULT_EFFORT : value;
}

function savePayload(profile: LLMProfile, reasoningEffort: string) {
  return {
    id: Number(profile.id),
    name: profile.name,
    format: profile.format,
    model: profile.model,
    base_url: profile.base_url ?? "",
    proxy: profile.proxy ?? "",
    rate_per_second: profile.rate_per_second ?? 0,
    rate_per_minute: profile.rate_per_minute ?? 0,
    context_window_k: profile.context_window_k ?? 0,
    thinking_type: profile.thinking_type ?? "",
    reasoning_effort: reasoningEffort,
    priority: profile.priority ?? 0,
    pool_exclude: profile.pool_exclude ?? false,
    streaming: profile.streaming !== false,
    max_tokens: profile.max_tokens ?? 0,
    max_tokens_field: profile.max_tokens_field ?? "",
    session_header_key: profile.session_header_key ?? "",
    ...(profile.retry ? { retry: profile.retry } : {}),
  };
}

export interface ArtexComposerSelection extends ComposerSelection {
  profiles: LLMProfile[];
  /** 实际会生效的档案（agent 绑定 → 会话 pin → 全局激活） */
  effectiveProfile: LLMProfile | null;
  activeProfile: LLMProfile | null;
  reloadProfiles: () => Promise<void>;
  savingSelection: boolean;
  /** 选择器是否只读（agent 绑定压过会话 pin 时为 true） */
  modelLocked: boolean;
  modelLockedReason?: string;
}

export interface ArtexComposerSelectionOptions {
  /** 会话 pin（PATCH /conversations/{id}/profile） */
  pinnedProfileId?: number | null;
  /** 宿主从服务端解析出的最终档案（任务链等客户端无法自行推断的状态） */
  resolvedProfileId?: number | null;
  /** 没有档案 id 的宿主配置（如环境变量）仍可显示真实模型名 */
  resolvedModelLabel?: string;
  /** 当前 agent key —— agent 绑定在服务端优先级最高 */
  agentKey?: string;
  /** 宿主明确要求只读（例如任务使用独立 LLM 链） */
  modelLocked?: boolean;
  modelLockedReason?: string;
  /** 有会话时：选模型写会话 pin，而不是切全局激活 */
  onSelectModel?: (profileId: number) => Promise<void> | void;
  /** 切换失败时把原因交给宿主（输入区/提示条）显示 */
  onError?: (message: string) => void;
}

export function useArtexComposerSelection(
  options: ArtexComposerSelectionOptions = {},
): ArtexComposerSelection {
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);
  const [agents, setAgents] = useState<ArtexAgent[]>([]);
  const [agentsReady, setAgentsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const reloadProfiles = useCallback(async () => {
    const request = ++loadRequestRef.current;
    const [profileResult, agentResult] = await Promise.allSettled([
      artexApi.llmProfiles(),
      artexApi.agents(),
    ]);
    if (request !== loadRequestRef.current) return;

    const failures: string[] = [];
    if (profileResult.status === "fulfilled") {
      setProfiles(profileResult.value);
    } else {
      failures.push(
        profileResult.reason instanceof Error ? profileResult.reason.message : "模型配置加载失败",
      );
    }
    if (agentResult.status === "fulfilled") {
      setAgents(agentResult.value);
      setAgentsReady(true);
    } else {
      setAgentsReady(false);
      failures.push(agentResult.reason instanceof Error ? agentResult.reason.message : "Agent 加载失败");
    }
    onErrorRef.current?.(failures.join(" · "));
  }, []);

  useEffect(() => {
    void options.agentKey;
    setAgentsReady(false);
    void reloadProfiles();
    const onChanged = () => void reloadProfiles();
    window.addEventListener("artex:llm-changed", onChanged);
    return () => {
      loadRequestRef.current += 1;
      window.removeEventListener("artex:llm-changed", onChanged);
    };
  }, [options.agentKey, reloadProfiles]);

  const globalActive = profiles.find((profile) => profile.is_default) ?? null;
  const resolvedProfile =
    options.resolvedProfileId != null
      ? profiles.find((profile) => String(profile.id) === String(options.resolvedProfileId))
      : undefined;
  const agentBinding = options.agentKey
    ? (agents.find((agent) => agent.key === options.agentKey)?.llm_profile_id ?? null)
    : null;
  /**
   * 与服务端 resolveChatAgent 的优先级保持一致：agent 绑定 → 会话 pin → 全局激活。
   * 之前只读全局激活，芯片会把「实际在用别的档案」的会话显示成全局模型。
   */
  const boundProfile =
    agentBinding != null
      ? profiles.find((profile) => String(profile.id) === String(agentBinding))
      : undefined;
  const activeProfile =
    resolvedProfile ??
    boundProfile ??
    profiles.find((profile) => String(profile.id) === String(options.pinnedProfileId)) ??
    globalActive;
  /**
   * agent 绑定了档案时，服务端绑定永远压过会话 pin —— 这时让用户在下拉里换模型只会
   * 写进一个永不生效的 pin。把选择器置为只读并给出原因（去 Agent 设置里改绑定）。
   */
  const lockedByAgent = boundProfile != null;
  const bindingPending = Boolean(options.agentKey) && options.resolvedProfileId == null && !agentsReady;
  const modelLocked = Boolean(options.modelLocked) || lockedByAgent || bindingPending;
  const modelLockedReason = options.modelLocked
    ? options.modelLockedReason
    : lockedByAgent
      ? "该 Agent 已绑定模型，请在「Agent 运行」里修改绑定"
      : bindingPending
        ? "正在确认 Agent 模型绑定"
        : undefined;

  const models: ChatModelOption[] = useMemo(
    () =>
      profiles.map((profile) => ({
        id: String(profile.id),
        label: profile.model,
        effort: effortLabel(profile.reasoning_effort),
      })),
    [profiles],
  );

  const effort = effortLabel(activeProfile?.reasoning_effort);
  const efforts = useMemo(() => {
    const levels = providerEffortLevels(activeProfile);
    return levels.includes(effort) ? levels : [...levels, effort];
  }, [activeProfile, effort]);

  const setModelId = useCallback(
    (id: string) => {
      if (!id || modelLocked || savingRef.current) return;
      savingRef.current = true;
      options.onError?.("");
      setSaving(true);
      void (async () => {
        try {
          if (options.onSelectModel) await options.onSelectModel(Number(id));
          else await artexApi.activateLLMProfile(id);
          await reloadProfiles();
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "切换模型失败";
          if (options.onError) options.onError(message);
          else console.error("[model-selection] switch failed:", caught);
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      })();
    },
    [modelLocked, options.onSelectModel, options.onError, reloadProfiles],
  );

  const setEffort = useCallback(
    (next: string) => {
      if (!activeProfile || modelLocked || savingRef.current) return;
      savingRef.current = true;
      options.onError?.("");
      const raw = next === DEFAULT_EFFORT ? "" : next;
      setSaving(true);
      void artexApi
        .saveLLMProfile(savePayload(activeProfile, raw))
        .then(() => {
          window.dispatchEvent(new CustomEvent("artex:llm-changed"));
          return reloadProfiles();
        })
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : "保存强度失败";
          if (options.onError) options.onError(message);
          else console.error("[model-selection] effort save failed:", caught);
        })
        .finally(() => {
          savingRef.current = false;
          setSaving(false);
        });
    },
    [activeProfile, modelLocked, options.onError, reloadProfiles],
  );

  return {
    model: {
      id: activeProfile ? String(activeProfile.id) : "",
      label: activeProfile?.model || options.resolvedModelLabel || "未配置模型",
      effort,
    },
    models,
    modelLocked,
    modelLockedReason,
    efforts,
    maxEffort: "max",
    effort,
    setModelId,
    setEffort,
    profiles,
    activeProfile,
    effectiveProfile: activeProfile,
    reloadProfiles,
    savingSelection: saving,
    savingModel: saving,
  };
}
