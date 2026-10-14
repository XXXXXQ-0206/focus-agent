import assert from "node:assert/strict";
import test from "node:test";

import { filterSystemLogs, mergeSystemLogs } from "./system-pages-model.ts";

test("merges history and stream records by database id, keeping the streamed cursor", () => {
  const merged = mergeSystemLogs(
    [
      { db_id: 12, ts: "2026-10-14T01:00:00Z", level: "info", tag: "api", text: "ready" },
      { db_id: 11, ts: "2026-10-14T00:59:00Z", level: "warn", tag: "db", text: "slow" },
    ],
    [
      { seq: 32, db_id: 12, ts: "2026-10-14T01:00:00Z", level: "info", tag: "api", text: "ready" },
      { seq: 33, ts: "2026-10-14T01:01:00Z", level: "error", tag: "agent", text: "failed" },
    ],
  );

  assert.deepEqual(
    merged.map((line) => [line.db_id, line.seq]),
    [
      [11, undefined],
      [12, 32],
      [undefined, 33],
    ],
  );
});

test("filters system logs by severity and case-insensitive text across tag and message", () => {
  const lines = [
    { seq: 1, ts: "2026-10-14T01:00:00Z", level: "info", tag: "planner", text: "Started" },
    { seq: 2, ts: "2026-10-14T01:01:00Z", level: "error", tag: "worker", text: "Request failed" },
  ];

  assert.deepEqual(
    filterSystemLogs(lines, "WORK", "error").map((line) => line.seq),
    [2],
  );
  assert.deepEqual(filterSystemLogs(lines, "not found", "all"), []);
});
