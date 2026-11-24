import assert from "node:assert/strict";
import test from "node:test";

import { canSendTaskMessage, taskComposerReadOnly } from "../src/artex/task-chat-policy.ts";
import { hasComposerContent } from "../src/chat/can-send.ts";
import { providerEffortLevels } from "../src/chat/options.ts";

test("composer accepts text, attachments, or both", () => {
  assert.equal(hasComposerContent("hello"), true);
  assert.equal(hasComposerContent("   ", 1), true);
  assert.equal(hasComposerContent("hello", 1), true);
  assert.equal(hasComposerContent("   "), false);
});

test("historical task sessions are read-only, but queued main messages may drain", () => {
  assert.equal(canSendTaskMessage("main"), true);
  assert.equal(canSendTaskMessage("main:3"), false);
  assert.equal(canSendTaskMessage("main:3", true), true);
  assert.equal(taskComposerReadOnly("main"), false);
  assert.equal(taskComposerReadOnly("plan"), true);
});

test("DeepSeek only exposes its verified effort values", () => {
  assert.deepEqual(providerEffortLevels({ base_url: "https://api.deepseek.com/v1" }), [
    "默认",
    "low",
    "high",
    "max",
  ]);
  assert.equal(providerEffortLevels({ model: "another-model" }).includes("medium"), true);
});
