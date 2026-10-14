import assert from "node:assert/strict";
import test from "node:test";
import { nativeFallbackUrl } from "../src/artex/native-fallback.ts";

test("native fallback preserves the business route, query, and hash", () => {
  assert.equal(
    nativeFallbackUrl({ pathname: "/function/tasks/detail", search: "?id=42", hash: "#sessions" }),
    "/artex/function/tasks/detail?id=42#sessions",
  );
});

test("native fallback normalizes a pathname without a leading slash", () => {
  assert.equal(nativeFallbackUrl({ pathname: "system/logs", search: "", hash: "" }), "/artex/system/logs");
});
