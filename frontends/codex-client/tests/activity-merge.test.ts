import assert from "node:assert/strict";
import test from "node:test";

import { appendUniqueActivities } from "../src/artex/activity-merge.ts";

test("incremental activity merge drops duplicate sequence ids", () => {
  const current = [{ seq: 1, message: "first" }];
  const merged = appendUniqueActivities(current, [
    { seq: 1, message: "duplicate" },
    { seq: 2, message: "second" },
  ]);
  assert.deepEqual(
    merged.map((item) => item.seq),
    [1, 2],
  );
  assert.equal(merged[0]?.message, "first");
});

test("incremental activity merge keeps id-less diagnostic events", () => {
  const merged = appendUniqueActivities([], [{ message: "one" }, { message: "two" }]);
  assert.equal(merged.length, 2);
});
