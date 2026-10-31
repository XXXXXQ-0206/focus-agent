import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownBlocks } from "../src/chat/markdown-blocks.ts";

test("parses compact GFM table rows and column alignment", () => {
  const blocks = parseMarkdownBlocks(`
|级别|数量|内容|
|:---|:---:|---:|
|高危|0|未确认|
|低危|2|响应头缺失|
`);

  assert.deepEqual(blocks, [
    {
      kind: "table",
      headers: ["级别", "数量", "内容"],
      align: ["left", "center", "right"],
      rows: [
        ["高危", "0", "未确认"],
        ["低危", "2", "响应头缺失"],
      ],
    },
  ]);
});

test("keeps escaped pipes and pipes inside code spans within one cell", () => {
  const blocks = parseMarkdownBlocks(`
字段 | 示例 | 说明
--- | --- | ---
表达式 | \`a|b\` | 管道写作 \\|
`);

  assert.deepEqual(blocks, [
    {
      kind: "table",
      headers: ["字段", "示例", "说明"],
      align: [null, null, null],
      rows: [["表达式", "`a|b`", "管道写作 |"]],
    },
  ]);
});
