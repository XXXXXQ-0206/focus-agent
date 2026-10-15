import { messageToBlocks } from "./block-adapter";
import type { RuntimeMessage } from "./types";

/**
 * 一轮里的代码改动汇总（用户 2026-10-15 给的官方截图里那条
 * 「3 个文件已更改 +121 -0」胶囊）。
 *
 * 数据来源逐条说明（**不编造**）：
 *   · 文件数 = 该轮所有 `file-edit` 块里的 `files` 去重后的条数
 *     （同一路径多次编辑只算一个文件，与官方「N 个文件」语义一致）；
 *   · `+a −d` = 各 `file-edit` 块里 `added`/`deleted` 的求和；
 *     若块里没有这两个字段、但有 diff 行，则按行类型数（add / del）现算；
 *   · 两者都没有（ARTEX 的适配层目前就填不出行数，见 chat/block-adapter.ts 的诚实边界）时
 *     返回 0 —— 调用方据此只显示「N 个文件已更改」，**不摆一个假的 +0 −0**。
 */
export interface TurnChanges {
  files: number;
  added: number;
  deleted: number;
  /** false = 只有文件数可靠，行数拿不到（不渲染 +/- 两个数字） */
  hasLineCounts: boolean;
}

export function turnChangesOf(messages: RuntimeMessage[]): TurnChanges | null {
  const paths = new Set<string>();
  let added = 0;
  let deleted = 0;
  let counted = false;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of messageToBlocks(message)) {
      if (block.kind === "file-edit") {
        for (const file of block.files) {
          paths.add(file.path || file.id);
          if (typeof file.added === "number") {
            added += file.added;
            counted = true;
          }
          if (typeof file.deleted === "number") {
            deleted += file.deleted;
            counted = true;
          }
          if (file.added === undefined && file.deleted === undefined && file.lines?.length) {
            for (const line of file.lines) {
              if (line.type === "change-addition") added += 1;
              else if (line.type === "change-deletion") deleted += 1;
            }
            counted = true;
          }
        }
        continue;
      }
      if (block.kind === "diff") {
        for (const line of block.lines) {
          if (line.type === "change-addition") added += 1;
          else if (line.type === "change-deletion") deleted += 1;
        }
        counted = true;
      }
    }
  }

  if (paths.size === 0) return null;
  return { files: paths.size, added, deleted, hasLineCounts: counted };
}
