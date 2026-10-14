import type { Message as MessageModel, ToolCall } from "@/lib/types";
import type { ActivityStatus, BlockNode } from "./blocks";

/**
 * 领域模型 → 官方会话块词汇的适配层（Lead 独占）。
 *
 * 为什么需要这一层：
 *   - `src/lib/types.ts` 的 `ToolCall` 是我们自己的简化模型（id/name/summary/input/output）；
 *   - `src/chat/blocks/**` 实现的是**官方**的块词汇（exec / file-edit / diff / reasoning / …），
 *     字段来自 docs/SPEC-CONVERSATION-BLOCKS.md 的逐层实测。
 * 直接让 UI 认我们的模型，会把官方词汇漏掉；让 blocks 认我们的模型，又会污染那份实测契约。
 * 所以中间放这一层，将来 `src/chat/runtime/**` 产出更丰富的节点时只改这里。
 *
 * ⚠️ 映射的诚实边界：
 *   - 我们模型里没有 exitCode / 行数增删 / diff 行，所以这些字段**留空**而不是编造；
 *   - shell 类工具映射成 ExecNode（官方 §4 完整实测的那一类），其余工具映射成 TerminalNode；
 *   - 这不是「与官方一致」的等价物，只是把现有数据喂进正确的块里。
 */

/** 工具名 → 官方块类别的判定表（小写匹配子串）。 */
const SHELL_TOOLS = ["bash", "shell", "exec", "run", "command", "terminal", "test", "build"];
const FILE_TOOLS = ["read_file", "write_file", "edit_file", "apply_patch", "create_file", "file"];
/**
 * 只读类工具：读文件 / 列目录 / 搜索 / 查看图片 …（小写匹配子串）。
 *
 * 官方对这类工具用的是**通用工具卡**（`Kx` 那条分支：read / search / list_files 之外的工具
 * 才交给 exec 的 `Jx`，反过来这三类**不走** exec 的命令行卡，见本文件 file-edit 分支的注释）。
 * 2026-10-15 新增：此前 `read_file` 落进 FILE_TOOLS ⇒ 块头写「已编辑 read_file」——
 * 读文件被说成"编辑"，与官方动作词不符（官方 exec 的 action 词表见 SPEC §4.4）。
 */
const READ_ONLY_TOOLS = [
  "read",
  "list",
  "search",
  "grep",
  "glob",
  "find",
  "cat",
  "head",
  "tail",
  "stat",
  "inspect",
  "view",
];

function isShellTool(name: string): boolean {
  const n = name.toLowerCase();
  return SHELL_TOOLS.some((k) => n.includes(k));
}

function isFileTool(name: string): boolean {
  const n = name.toLowerCase();
  return FILE_TOOLS.some((k) => n.includes(k));
}

function isReadOnlyTool(name: string): boolean {
  const n = name.toLowerCase();
  return READ_ONLY_TOOLS.some((k) => n.includes(k));
}

/**
 * 我们的四态 → 官方四态（官方词表见 src/chat/blocks/types.ts 的 ActivityStatus）。
 *
 * ⚠️ `pending` 映射到 **stopped 而不是 running** —— 这是一条修过的真缺陷：
 * 我们的 `ToolCall.status` 里 `pending` 表示「已请求、还没执行」，而线上**没有配置 toolExecutor**，
 * 于是一条 pending 的调用永远不会推进。早先把它归到 `running` 的后果是
 * **工具卡永远转圈、而且因为 running 会自动展开，它会一直占着展开态**。
 * 官方词表里没有「排队中」，最接近且不误导的是 `stopped`（= 没有执行）。
 */
function toActivityStatus(status: ToolCall["status"]): ActivityStatus {
  switch (status) {
    case "running":
      return "running";
    case "pending":
      return "stopped";
    case "error":
      return "failed";
    default:
      return "completed";
  }
}

/**
 * 从工具入参里取出真正的命令行。
 *
 * ⚠️ 也不能直接把 `call.input` 当命令 —— 它是**原始 JSON 字符串**（形如
 * `{"command":"ls -la","timeout":30000}`），直接渲染出来就是一段 JSON 糊在命令行位置上。
 * 官方 exec 块的命令行位置放的是 `command` 字段本身（SPEC §4）。
 * 所以先尝试解析取 `command`；解析不出来（或没有该字段）才退回原文 —— 不猜、不丢信息。
 */
function commandOf(call: ToolCall): string {
  const raw = call.input ?? "";
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const command = parsed.command ?? parsed.cmd ?? parsed.script;
      if (typeof command === "string" && command.trim() !== "") return command;
    } catch {
      /* 不是合法 JSON，按原文处理 */
    }
  }
  return raw !== "" ? raw : call.summary;
}

function tooleCallToNode(call: ToolCall, _index: number): BlockNode {
  const status = toActivityStatus(call.status);

  if (isShellTool(call.name)) {
    return {
      kind: "exec",
      id: call.id,
      status,
      // 官方命令行不带 `$ ` 前缀（提示符由块自己渲染，见 SPEC §4）。
      command: commandOf(call),
      output: call.output,
      shell: "Shell",
      /**
       * ⚠️ **不传 `call.summary`**（2026-10-15 修的真实缺陷，mock 数据实测复现）：
       * ARTEX 侧 `toTaskTranscript()` 在 `tool_use` 事件到达时就按**当时**的状态把摘要
       * 烘成了字符串（`activityToolSummary()` → 「已停止 <命令>」），`tool_result` 到达后
       * 只补了 `status` / `output`，**没有重算摘要** ⇒ 块头永远显示「已停止」，
       * 而同一张卡的展开体里状态行却写着「成功」——同一张卡自相矛盾。
       * 官方 exec 块头的摘要本来就是 `ACTION_BY_STATUS[status] + command` 现场派生的
       * （SPEC §4.3/§4.4），所以这里把它交回块自己渲染：状态一翻，文案跟着翻。
       */
      /**
       * ⚠️ **这里刻意不产出 `defaultExpanded`** —— R4（docs/RULINGS.md「exec 工具卡官方在流式中
       * 也不自动展开 ⇒ 我们应向官方对齐」）。旧代码写的是 `defaultExpanded: status === "running"`，
       * 那条「流式自动展开」是**我们自己发明的**，没有官方出处：
       *
       *   · 官方唯一渲染 `data-testid="exec-shell-body"` 的组件是 sites-end-resource 的 `Jx`：
       *     `useState("collapsed")` + **只由用户点击改**，把 `{expanded,onToggle}` 直接交给块头骨架，
       *     **不经过** tool-activity-disclosure 状态机 ⇒ running 期间官方 exec 卡也不展开；
       *   · 「流式展开 / 完成折叠」在官方**只确证于推理块**（`Aw` 的 `y = c ? … : m`）；
       *   · 参考端运行时**工具卡 0 实测**（captures 里 read_file / exec-shell-body / aria-expanded 全 0 命中），
       *     所以旧值既没有正面证据、也没有被参考端采到过。
       *
       * ⇒ 展开态改由 ExecBlock 组件自己持有（恒从 collapsed 起步、仅用户点击切换），适配层不再派生它；
       *    消费方**不要**再按 status 造这个字段。selftest 的「事件映射/工具调用」用例钉的就是这一条。
       */
    };
  }

  // 只读工具**先判**（read_file 同时命中 FILE_TOOLS 的 "file" 子串）：它们走通用工具卡，
  // 块头是「已查看 read_file」这类动作词，而不是 file-edit 的「已编辑 … +0 −0」。
  if (isReadOnlyTool(call.name)) {
    const action = status === "running" ? "正在查看" : status === "failed" ? "查看失败" : "已查看";
    return {
      kind: "terminal",
      id: call.id,
      status,
      text: call.output ?? call.summary,
      shell: call.name,
      summary: `${action} ${call.name}`,
    };
  }

  if (isFileTool(call.name)) {
    /**
     * ★ 2026-10-15（用户：要那条「N 个文件已更改 +a −d」胶囊）：
     *   原先这里**恒**只造一个文件、行数恒 0（「模型里没有就别编」那条诚实边界的后果是
     *   文件卡永远写「已编辑 apply_patch +0 −0」，胶囊也只能显示文件数）。
     *   但工具**输出里本来就有补丁文本**：apply_patch 的 `*** Update File: <path>` 段与
     *   unified diff 的 `+++ b/<path>` 头都能解析出**真实路径与真实行数**。
     *   所以这里改为：能从输出里解析出补丁就按补丁造卡（路径/增删都是真的），
     *   解析不出才退回原来那条「路径 = 工具 summary、不给行数」的保守形态。
     */
    const patched = parsePatchStats(call.output ?? "");
    if (patched.length > 0) {
      return {
        kind: "file-edit",
        id: call.id,
        status,
        files: patched.map((file, index) => ({
          id: `${call.id}-f${index}`,
          path: file.path,
          added: file.added,
          deleted: file.deleted,
        })),
        defaultExpanded: false,
      };
    }
    return {
      kind: "file-edit",
      id: call.id,
      status,
      files: [
        {
          id: `${call.id}-f0`,
          // 我们模型里没有拆出路径字段，用 summary 代。
          // 行数增删我们的模型里也没有 —— 官方块要求这两个字段，只能填 0；
          // 因此徽章会显示 +0 −0，**这是数据缺口不是样式错**，等 runtime 产出真实 diff 后自然填上。
          path: call.summary,
          added: 0,
          deleted: 0,
        },
      ],
      // 同上：摘要由 FileEditBlock 按 status + files 派生（「已编辑 <路径> +a −d」），
      // 不喂外面那份在 tool_use 时刻烘死的字符串。
      defaultExpanded: false,
    };
  }

  return {
    kind: "terminal",
    id: call.id,
    status,
    text: call.output ?? call.summary,
    shell: call.name,
    summary: call.summary,
    /**
     * 通用工具（非 shell / 非 file）走 terminal 块 —— 但它渲染的是**同一张官方 exec 卡**
     * （TerminalBlock 的输出容器就是 `data-testid="exec-shell-body"`，官方 `Kx` 把
     * read / search / list_files 之外的工具**全交给 `Jx`**）。
     * ⇒ 展开态同样不在这里派生（R4）：恒折叠、只由用户点击打开，见 TerminalBlock.tsx。
     */
  };
}

/**
 * 从工具的补丁文本里抠出「改了哪些文件、各增删多少行」。
 *
 * 支持两种常见形态（都是**工具真的吐出来的**文本，不是猜的）：
 *   · OpenAI `apply_patch`：`*** Update File: <path>` / `*** Add File: <path>` / `*** Delete File: <path>`
 *   · 标准 unified diff：`+++ b/<path>` 头
 * 计数规则：补丁体内以 `+` 开头记增、`-` 开头记删；文件头那两行（`+++` / `---`）与
 * `@@` / `*** …` 之类的元信息行都不计。解析不出文件头时返回空数组（调用方走保守分支）。
 */
export function parsePatchStats(text: string): { path: string; added: number; deleted: number }[] {
  if (!text) return [];
  const files: { path: string; added: number; deleted: number }[] = [];
  let current: { path: string; added: number; deleted: number } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const applyPatchHeader = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(line);
    if (applyPatchHeader) {
      current = { path: applyPatchHeader[1].trim(), added: 0, deleted: 0 };
      files.push(current);
      continue;
    }
    const unifiedHeader = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (unifiedHeader) {
      current = { path: unifiedHeader[1].trim(), added: 0, deleted: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) current.added += 1;
    else if (line.startsWith("-")) current.deleted += 1;
  }
  // 去掉「只有文件头、一行增删都没有」的空段（例如补丁被截断）
  return files.filter((file) => file.added > 0 || file.deleted > 0);
}

/**
 * 工具调用的「类别 + 动作词」——给**折叠组头**用（ToolActivityGroup.tsx）。
 *
 * 参考截图（Codex 转录里的组头那一行）把组内各条的动作词直接拼起来：
 *   `编辑了文件运行了命令`
 * 所以这里返回的就是那种短语。类别三种与官方块词汇的落点一致
 * （exec = 命令卡 / file-edit = 逐文件头 / terminal = 通用工具卡）：
 *   · shell 类           → exec      「运行了命令」
 *   · 只读类             → terminal  「查看了文件」
 *   · 写文件类           → file-edit 「编辑了文件」
 *   · 其余               → terminal  「使用了工具」
 */
export function describeToolCall(call: ToolCall): {
  kind: "exec" | "file-edit" | "terminal";
  label: string;
} {
  if (isShellTool(call.name)) return { kind: "exec", label: "运行了命令" };
  if (isReadOnlyTool(call.name)) return { kind: "terminal", label: "查看了文件" };
  if (isFileTool(call.name)) return { kind: "file-edit", label: "编辑了文件" };
  return { kind: "terminal", label: "使用了工具" };
}

/**
 * 一条消息 → 块列表。顺序按官方：**推理块在前，工具块居中，正文由消息自己渲染**。
 * 返回空数组时调用方不应渲染 ActivityGroup（避免多出一层空容器影响 gap）。
 */
export function messageToBlocks(message: MessageModel): BlockNode[] {
  const blocks: BlockNode[] = [];

  if (message.reasoning) {
    blocks.push({
      kind: "reasoning",
      id: `${message.id}-reasoning`,
      status: message.streaming ? "running" : "completed",
      content: message.reasoning,
    });
  }

  for (const [index, call] of (message.toolCalls ?? []).entries()) {
    blocks.push(tooleCallToNode(call, index));
  }

  return blocks;
}
