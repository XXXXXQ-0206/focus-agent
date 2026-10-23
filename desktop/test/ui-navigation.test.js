const test = require("node:test");
const assert = require("node:assert/strict");

const {
  APP_ORIGIN,
  UI_ROUTES,
  hasArtexHealthIdentity,
  isLocalAppURL,
  isSafeExternalWebURL,
  uiModeForURL,
} = require("../lib/ui-navigation");

test("recognizes only the exact local ARTEX origin", () => {
  assert.equal(isLocalAppURL(`${APP_ORIGIN}/`), true);
  assert.equal(isLocalAppURL(`${APP_ORIGIN}/artex/function/tasks?id=1`), true);

  for (const url of [
    "https://127.0.0.1:8787/",
    "http://127.0.0.1:8788/",
    "http://localhost:8787/",
    "http://127.0.0.1.evil:8787/",
    "http://user@127.0.0.1:8787/",
    "file:///C:/private.html",
    "not a URL",
  ]) {
    assert.equal(isLocalAppURL(url), false, url);
  }
});

test("only credential-free HTTP(S) URLs qualify for the system browser", () => {
  assert.equal(isSafeExternalWebURL("https://example.com/docs"), true);
  assert.equal(isSafeExternalWebURL("http://example.com:8080/"), true);

  for (const url of [
    "javascript:alert(1)",
    "file:///C:/private.html",
    "mailto:person@example.com",
    "https://user:secret@example.com/",
    "not a URL",
  ]) {
    assert.equal(isSafeExternalWebURL(url), false, url);
  }
});

test("health response must identify a healthy ARTEX service", () => {
  assert.equal(hasArtexHealthIdentity('{"ok":true,"service":"artex","version":"2.2.0"}'), true);
  assert.equal(hasArtexHealthIdentity('{"ok":true,"service":"other"}'), false);
  assert.equal(hasArtexHealthIdentity('{"ok":false,"service":"artex"}'), false);
  assert.equal(hasArtexHealthIdentity("not json"), false);
  assert.equal(hasArtexHealthIdentity("x".repeat(8193)), false);
});

test("desktop exposes a single Focus renderer", () => {
  assert.deepEqual(Object.keys(UI_ROUTES), ["focus"]);
  assert.equal(UI_ROUTES.focus.path, "/");
  assert.equal(uiModeForURL(`${APP_ORIGIN}/`), "focus");
  assert.equal(uiModeForURL(`${APP_ORIGIN}/artex`), "focus");
  assert.equal(uiModeForURL(`${APP_ORIGIN}/function/tasks?id=1`), "focus");
  assert.equal(uiModeForURL("http://localhost:8787/artex/"), null);
});
