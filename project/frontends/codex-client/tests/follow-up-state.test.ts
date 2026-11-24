import assert from "node:assert/strict";
import test from "node:test";

import { queueAfterSend } from "../src/chat/follow-up-state.ts";

const queue = [{ id: "first" }, { id: "second" }];

test("failed queued sends remain available for retry", () => {
  assert.strictEqual(queueAfterSend(queue, "first", false), queue);
});

test("successful queued sends leave the queue exactly once", () => {
  assert.deepEqual(queueAfterSend(queue, "first", true), [{ id: "second" }]);
  assert.deepEqual(queueAfterSend(queue, "second", true), [{ id: "first" }]);
});
