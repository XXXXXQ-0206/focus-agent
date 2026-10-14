import assert from "node:assert/strict";
import test from "node:test";
import { ARTEXTaskTabs, taskTabLabel } from "../src/artex/task-workbench.ts";

test("task workbench exposes the ARTEX detail tabs in a stable order", () => {
  assert.deepEqual(ARTEXTaskTabs.map((tab) => tab.id), [
    "activity",
    "sessions",
    "overview",
    "discovery",
    "retest",
    "assets",
    "coverage",
    "intercept",
    "report",
  ]);
  assert.equal(taskTabLabel("sessions"), "会话");
});
