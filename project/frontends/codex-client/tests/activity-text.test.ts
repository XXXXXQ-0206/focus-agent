import assert from "node:assert/strict";
import test from "node:test";

import { userActivityText } from "../src/artex/activity-text.ts";

test("user transcript prefers full detail over its first-line summary", () => {
  assert.equal(
    userActivityText({
      kind: "user",
      summary: "第一行…",
      detail: "第一行\n\n第二段\n\n- 第三部分",
    }),
    "第一行\n\n第二段\n\n- 第三部分",
  );
});

test("user transcript unwraps attachment JSON and keeps the complete text", () => {
  assert.equal(
    userActivityText({
      kind: "user",
      summary: "检查这个文件…",
      detail: JSON.stringify({
        text: "检查这个文件\n并给出完整结论",
        attachments: [{ name: "report.md" }],
      }),
    }),
    "检查这个文件\n并给出完整结论",
  );
});

test("user transcript falls back to summary for legacy rows without detail", () => {
  assert.equal(userActivityText({ kind: "user", summary: "旧消息预览" }), "旧消息预览");
});
