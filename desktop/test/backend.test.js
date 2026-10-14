const test = require("node:test");
const assert = require("node:assert/strict");

const { createController } = require("../lib/backend");

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
