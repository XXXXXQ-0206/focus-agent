// ARTEX 后端控制器：解析安装目录、探活、按需拉起 PostgreSQL + artex.exe、退出时回收。
// 与 C:\artex-ymh\launcher（托盘启动器）保持同一套语义：
//   - 只停"由本进程拉起"的 PostgreSQL，用户手动起的库不动；
//   - 端口探活不建 HTTP 连接（TCP connect + 400ms 超时），开销可忽略。
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = 8787;
const PG_PORT = 5433;

/**
 * 解析 ARTEX 安装目录（含后端 artex.exe）：ARTEX_HOME → exe 同级/上级/上两级 → C:\artex-ymh
 *
 * 注意 Windows 文件系统不区分大小写：桌面端自己的 ARTEX.exe 在 existsSync 眼里就是
 * "artex.exe"，所以不能只看文件名。这里要求同目录还必须有 config.json（ARTEX 安装目录
 * 一定带它，Electron 应用目录没有），并且跳过应用自身所在目录。
 */
function resolveInstallDir(execPath) {
  const candidates = [];
  if (process.env.ARTEX_HOME) candidates.push(process.env.ARTEX_HOME);
  const selfDir = execPath ? path.dirname(execPath) : null;
  if (execPath) {
    candidates.push(path.dirname(execPath));
    candidates.push(path.dirname(path.dirname(execPath)));
    candidates.push(path.dirname(path.dirname(path.dirname(execPath))));
  }
  candidates.push("C:\\artex-ymh");
  const seen = new Set();
  for (const dir of candidates) {
    try {
      if (!dir) continue;
      const full = path.resolve(dir);
      if (seen.has(full)) continue;
      seen.add(full);
      if (selfDir && full.toLowerCase() === path.resolve(selfDir).toLowerCase()) continue;
      const exe = path.join(full, "artex.exe");
      const cfg = path.join(full, "config.json");
      if (fs.existsSync(exe) && fs.existsSync(cfg)) return full;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** TCP 探活：只做 connect，不发 HTTP 请求。 */
function probe(port = PORT, timeoutMs = 400) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: HOST, port });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.on("connect", () => done(true));
    sock.on("error", () => done(false));
  });
}

function createController(installDir, log) {
  let pgStartedByUs = false;
  let artexChild = null;

  const bin = (name) => (installDir ? path.join(installDir, name) : null);

  /** 确保本机便携版 PostgreSQL 在跑；由我们拉起的记 pgStartedByUs，退出时一并停掉。 */
  function ensurePostgres() {
    if (!installDir) return true;
    const pgCtl = bin("pgsql\\bin\\pg_ctl.exe");
    const pgData = bin("data\\pgdata");
    if (!fs.existsSync(pgCtl) || !fs.existsSync(pgData)) return true; // 外部数据库部署

    const ready = spawnSync(bin("pgsql\\bin\\pg_isready.exe"), ["-h", HOST, "-p", String(PG_PORT), "-q"], {
      windowsHide: true,
      timeout: 5000,
    });
    if (ready.status === 0) return true;

    const res = spawnSync(pgCtl, ["-D", pgData, "-l", bin("data\\pg.log"), "-w", "start"], {
      windowsHide: true,
      timeout: 60000,
    });
    pgStartedByUs = true;
    if (res.status !== 0) {
      log?.("[backend] pg_ctl start failed: " + (res.stderr?.toString() || res.status));
      return false;
    }
    return true;
  }

  /** 拉起 artex.exe（日志追加到 data\artex.err.log），返回是否成功。 */
  function startArtex() {
    if (!installDir) return false;
    if (!ensurePostgres()) return false;
    const exe = bin("artex.exe");
    const outLog = bin("data\\artex.err.log");
    try {
      // 直接 spawn 后端 + 把 stdout/stderr 指向日志文件（fd 继承），
      // 不经 cmd.exe —— Node 会重新转义参数，套 cmd 的引号规则容易静默失败。
      const fd = fs.openSync(outLog, "a");
      artexChild = spawn(exe, ["-addr", `${HOST}:${PORT}`, "-proxy", `${HOST}:8788`], {
        cwd: installDir,
        windowsHide: true,
        detached: false,
        stdio: ["ignore", fd, fd],
      });
      fs.closeSync(fd); // 子进程持有自己的句柄
      log?.(`[backend] artex spawned pid=${artexChild.pid}`);
      artexChild.on("error", (err) => log?.("[backend] artex spawn error: " + err.message));
      artexChild.on("exit", (code, signal) => {
        log?.(`[backend] artex exited code=${code} signal=${signal}`);
        artexChild = null;
      });
      return true;
    } catch (err) {
      log?.("[backend] spawn artex failed: " + err.message);
      return false;
    }
  }

  function killTree(pid) {
    if (!pid || pid <= 0) return;
    try {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 8000 });
    } catch {
      /* ignore */
    }
  }

  /** 停掉 ARTEX：先杀我们拉起的进程树，再按端口占用者兜底；最后按需停库。 */
  function stopArtex() {
    if (artexChild && artexChild.pid) killTree(artexChild.pid);
    artexChild = null;
    // 端口占用者兜底（例如上一轮遗留的实例）
    const out = spawnSync("netstat", ["-ano"], { windowsHide: true, timeout: 5000, encoding: "utf8" });
    if (out.stdout) {
      for (const line of out.stdout.split(/\r?\n/)) {
        if (line.includes(`:${PORT}`) && line.toUpperCase().includes("LISTENING")) {
          const pid = Number(line.trim().split(/\s+/).pop());
          if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) killTree(pid);
        }
      }
    }
    if (pgStartedByUs && installDir) {
      try {
        spawnSync(bin("pgsql\\bin\\pg_ctl.exe"), ["-D", bin("data\\pgdata"), "stop", "-m", "fast"], {
          windowsHide: true,
          timeout: 20000,
        });
      } catch {
        /* ignore */
      }
      pgStartedByUs = false;
    }
  }

  return {
    installDir,
    isUp: () => probe(PORT),
    start: startArtex,
    stop: stopArtex,
    /** 已就绪就直接用，否则拉起并轮询等待（默认 60s）。 */
    async ensureRunning(timeoutMs = 60000) {
      if (await probe(PORT)) return true;
      if (!startArtex()) return false;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700));
        if (await probe(PORT)) return true;
      }
      return false;
    },
  };
}

module.exports = { resolveInstallDir, createController, probe };
