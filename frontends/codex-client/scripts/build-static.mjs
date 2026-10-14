import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const run = (args) => new Promise((resolveRun, reject) => {
  const child = spawn(npm, args, { cwd: root, stdio: "inherit", shell: false });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolveRun();
    else reject(new Error(`npm ${args.join(" ")} failed (${code ?? signal})`));
  });
});

await rm(resolve(root, "dist"), { recursive: true, force: true });
await run(["run", "build"]);
await mkdir(resolve(root, "dist"), { recursive: true });
