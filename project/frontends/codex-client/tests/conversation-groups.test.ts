import assert from "node:assert/strict";
import test from "node:test";

import { groupConversationsByAge } from "../src/shell/conversation-groups.ts";

const now = Date.parse("2026-10-12T12:00:00Z");

function conversation(id: number, hoursAgo: number) {
  return {
    id,
    agent_key: "auto",
    title: `conversation-${id}`,
    created_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
    updated_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
  };
}

test("conversation groups sort descending and partition at 24 hours", () => {
  const groups = groupConversationsByAge(
    [conversation(1, 30), conversation(2, 2), conversation(3, 1), conversation(4, 26)],
    now,
  );
  assert.deepEqual(
    groups.today.map((item) => item.id),
    [3, 2],
  );
  assert.deepEqual(
    groups.earlier.map((item) => item.id),
    [4, 1],
  );
});

test("invalid timestamps remain deterministic in the earlier group", () => {
  const invalid = { ...conversation(9, 1), created_at: "invalid", updated_at: "invalid" };
  const groups = groupConversationsByAge([invalid, conversation(2, 1)], now);
  assert.deepEqual(
    groups.today.map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    groups.earlier.map((item) => item.id),
    [9],
  );
});
