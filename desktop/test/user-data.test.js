const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { legacyUserDataPath, migrateLegacyUserData } = require("../lib/user-data");

test("migrates the legacy ARTEX profile when Focus has not been created", () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "focus-user-data-"));
  const legacy = legacyUserDataPath(appData);
  const current = path.join(appData, "Focus");
  try {
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, "Preferences"), "legacy");
    const result = migrateLegacyUserData({ appData, current, legacy });
    assert.equal(result.migrated, true);
    assert.equal(result.userDataPath, current);
    assert.equal(fs.readFileSync(path.join(current, "Preferences"), "utf8"), "legacy");
  } finally {
    fs.rmSync(appData, { recursive: true, force: true });
  }
});

test("keeps an existing Focus profile untouched", () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "focus-user-data-"));
  const legacy = legacyUserDataPath(appData);
  const current = path.join(appData, "Focus");
  try {
    fs.mkdirSync(legacy);
    fs.mkdirSync(current);
    fs.writeFileSync(path.join(current, "Preferences"), "focus");
    const result = migrateLegacyUserData({ appData, current, legacy });
    assert.equal(result.migrated, false);
    assert.equal(result.userDataPath, current);
    assert.equal(fs.readFileSync(path.join(current, "Preferences"), "utf8"), "focus");
  } finally {
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
