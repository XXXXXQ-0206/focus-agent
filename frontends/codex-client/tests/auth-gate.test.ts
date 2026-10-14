import assert from "node:assert/strict";
import test from "node:test";
import { authRouteDecision } from "../src/artex/auth-gate.ts";

test("authenticated navigation keeps the current business route", () => {
  assert.deepEqual(authRouteDecision({ initialized: true }, true, "/settings"), {
    state: "ready",
    redirect: null,
  });
});

test("unauthenticated navigation redirects once to login", () => {
  assert.deepEqual(authRouteDecision({ initialized: true }, false, "/new"), {
    state: "login",
    redirect: "/login",
  });
});

test("initialization takes precedence over an existing token", () => {
  assert.deepEqual(authRouteDecision({ initialized: false }, true, "/new"), {
    state: "init",
    redirect: "/init",
  });
});
