import assert from "node:assert/strict";
import test from "node:test";
import { streamOriginFor } from "../src/artex/stream-origin.ts";

test("activity stream uses the renderer origin so /api proxy keeps SSE same-origin", () => {
  assert.equal(streamOriginFor({ origin: "http://127.0.0.1:3000" }), "http://127.0.0.1:3000");
  assert.equal(streamOriginFor({ origin: "http://127.0.0.1:3001/" }), "http://127.0.0.1:3001");
});
