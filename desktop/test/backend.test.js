const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createController, resolveInstallDir } = require("../lib/backend");

test("does not kill an unowned process just because it listens on the ARTEX port", () => {
  const commands = [];
  const messages = [];
  const runSync = (command) => {
    commands.push(command);
    if (command === "netstat") {
      return { stdout: "  TCP    127.0.0.1:8787    0.0.0.0:0    LISTENING    1234\r\n" };
    }
    return { status: 0, stdout: "" };
  };

  createController(null, (message) => messages.push(message), runSync).stop();

  assert.deepEqual(commands, ["netstat"]);
  assert.deepEqual(messages, ["[backend] leaving unowned listener on 127.0.0.1:8787 (pid=1234) untouched"]);
});

test("finds a backend co-located with Focus.exe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "focus-desktop-"));
  try {
    fs.writeFileSync(path.join(dir, "artex.exe"), "");
    fs.writeFileSync(path.join(dir, "config.json"), "{}");
    fs.writeFileSync(path.join(dir, "Focus.exe"), "");
    assert.equal(resolveInstallDir(path.join(dir, "Focus.exe")), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
