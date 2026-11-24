import type { ComponentType } from "react";

import { ArtexAgentsSettingsPane, ArtexSearchPane } from "@/artex/settings-panes";
import { ApprovalsPane } from "./approvals";
import { ArchivedPane } from "./archived";
import { BrowserPane } from "./browser";
import { ConnectionsPane } from "./connections";
import { ModelApiPane } from "./model-api";
import { PluginsPane } from "./plugins";
import { ShortcutsPane } from "./shortcuts";
import { SyncPane } from "./sync";

/**
 * 设置分区页面的注册表（C2 组交付，共享任务 task-18；文件名必须是 index.tsx）。
 *
 * 这个文件是 C1（设置基础设施）与 C2（15 个取证页）之间的解耦接口：
 *   · C1 的 SettingsPage 只认这个 barrel，不直接 import 具体页面文件；
 *   · C2 在 panes/ 下写了 15 个页面，并在这里登记；key 与 nav-model 的 section id 一致。
 *
 * 官方设置导航共 3 组 18 项（出处：docs/SPEC-SETTINGS.md §3）：
 *   个人：常规 / 导入 / 外观 / Archived chats / 语音 / 配置 / 个性化 / Mini 与虚拟宠物 / 键盘快捷键
 *   集成：插件 / 电脑操控 / 浏览器
 *   编码：钩子 / 连接 / 代码审查 / Git / 环境 / Worktrees
 * 其中「常规 / 外观 / 键盘快捷键」+ 还原工程新增的「自定义 API」由 C1 实现，
 * 其余 15 项由 C2 实现并登记在下表（key 与桩文件完全一致，未改动）。
 *
 * 页面契约（C1 接入须知）：
 *   · 每个页面**自行渲染 H1**（28px/500，SPEC §2.1 实测）与分区卡片，根节点类名为
 *     **cx-pane**（[task-55] 原先还挂了一个别名 cx-settings-pane，全仓 CSS 从无该规则、已删）
 *     —— 所以 SettingsPage 不要再套一层标题，直接渲染本表的组件即可；
 *   · 页面样式全在 panes/panes.css，不依赖 C1 的 settings.css；内容列 728 居中由页面自己完成；
 *   · 状态只持久化在 localStorage 的 cx.pane.<section>（panes/pane-state.ts），不读写 C1 的 store.ts。
 *
 * key 说明：profile 对应官方第 6 项「配置」（官方 slug = agent，SPEC §4.2.5）——
 * key 名由接口固定，页面内部按「配置」实现。
 */
export interface SettingsPaneProps {
  /** 当前分区 id（与 nav-model 的 item.id 一致） */
  section: string;
}

/**
 * section id → 页面组件。
 *
 * 2026-10-15 第二轮（用户：「这些都做不了吗？有些还是可以的」）后：
 *   · plugins    —— 真实数据页：Focus MCP 服务器（添加/编辑/启停/刷新工具/删除）
 *   · browser    —— **恢复并做成真实页**：内置 Playwright MCP（状态/启停/工具清单/刷新）
 *   · connections—— 真实数据页：内网会话 / 隧道 / 凭据（远程连接的等价物，
 *                    官方『电脑操控』在这套产品里就是它，不再单开一页）
 *   · archived   —— 真实数据页：Focus 任务归档（查看/恢复/删除）
 *   · shortcuts  —— **恢复并做成真绑定页**：命令分发器见 ../commands.ts（改了立刻生效）
 *   · artex-*    —— Focus 服务端四个分区
 * 仍然删除的（本工程没有承接能力，逐条理由见 nav-model.ts）：
 *   导入 / 语音 / 配置（并入自定义 API 的「智能体默认」）/ 个性化（并入自定义 API 的
 *   系统提示词与「关于你」）/ Mini 宠物 / 旧版连接（远程设备控制，后端无通道）/
 *   代码审查 / Git / 环境 / Worktrees / 钩子。
 */
export const SETTINGS_PANES: Record<string, ComponentType<SettingsPaneProps>> = {
  "artex-agents": ArtexAgentsSettingsPane,
  "artex-search": ArtexSearchPane,
  approvals: ApprovalsPane,
  archived: ArchivedPane,
  browser: BrowserPane,
  connections: ConnectionsPane,
  /** 「模型与 API」= 原「LLM 配置」+「自定义 API」合并页（2026-10-15，按 dsh 的模型配置重做）。 */
  "model-api": ModelApiPane,
  plugins: PluginsPane,
  shortcuts: ShortcutsPane,
  sync: SyncPane,
};
