import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;

const run = (args) => new Promise((resolveRun, reject) => {
  const command = npmExecPath ? process.execPath : npm;
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: !npmExecPath && process.platform === "win32",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolveRun();
    else reject(new Error(`npm ${args.join(" ")} failed (${code ?? signal})`));
  });
});

await rm(resolve(root, "dist"), { recursive: true, force: true });
await run(["run", "build"]);
const embeddedUI = resolve(root, "../../../backend/server/webui/dist/codex");
await rm(embeddedUI, { recursive: true, force: true });
await mkdir(embeddedUI, { recursive: true });
await cp(resolve(root, "dist"), embeddedUI, { recursive: true });
