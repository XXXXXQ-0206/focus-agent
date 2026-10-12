// ARTEX 桌面端（Electron 外壳）——参考 dsh-desktop 的组织方式：
//   主进程负责拉起本机后端 + 一个窗口展示控制台 + 托盘图标，单实例。
// 语义与托盘启动器一致：托盘图标存在 ⇔ ARTEX 在跑；退出时回收后端（只停自己拉起的库）。
const { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const backend = require("./lib/backend");

const URL = "http://127.0.0.1:8787/";
const SILENT = process.argv.includes("--silent"); // 开机自启：只亮托盘，不弹窗
const ICON_RUNNING = path.join(__dirname, "assets", "artex_running.ico");
const ICON_STOPPED = path.join(__dirname, "assets", "artex_stopped.ico");

let win = null;
let tray = null;
let quitting = false;
let downTicks = 0;
let everUp = false;
let ctrl = null;
let tickTimer = null;

// 主题首帧：桌面端有自己的配置目录（%APPDATA%\ARTEX），拿不到系统浏览器里存的偏好，
// 所以首次运行必须自己播种 —— 否则默认值 light 会让深色系统的用户每次装完都是白屏。
// 用户以后在界面里改过的值优先（存在 theme_mode cookie 里，Electron 会持久化）。
async function seedThemeFromSystem() {
  const url = "http://127.0.0.1:8787/";
  try {
    const ses = session.defaultSession;
    const existing = await ses.cookies.get({ url, name: "theme_mode" });
    if (existing && existing.length > 0) {
      log(`[theme] keep existing theme_mode=${existing[0].value}`);
      return existing[0].value;
    }
    const value = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    await ses.cookies.set({
      url,
      name: "theme_mode",
      value,
      expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    });
    log(`[theme] seeded theme_mode=${value} (systemDark=${nativeTheme.shouldUseDarkColors})`);
    return value;
  } catch (err) {
    log("[theme] seed failed: " + err.message);
    return null;
  }
}

function log(msg) {
  try {
    const dir = path.join(app.getPath("userData"));
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "desktop.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignore */
  }
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    // 与主题一致，避免窗口先白后黑的闪一下
    backgroundColor: dark ? "#0b0b0c" : "#ffffff",
    title: "ARTEX",
    icon: ICON_RUNNING,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => {
    if (!SILENT) win.show();
  });
  // 关窗口 = 收进托盘（与 dsh-desktop 一致），真正退出走托盘菜单
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  // 外链走系统浏览器，不在壳里开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://127.0.0.1:8787")) shell.openExternal(url);
    return { action: "deny" };
  });
  // 自证：页面加载完成后回报实际生效的主题（免得"看起来是浅色"只能靠肉眼判断）
  win.webContents.on("did-finish-load", async () => {
    try {
      const state = await win.webContents.executeJavaScript(
        "({href: location.href, mode: document.documentElement.getAttribute('data-theme-mode'), dark: document.documentElement.classList.contains('dark')})",
        true,
      );
      log("[theme] window state " + JSON.stringify(state));
    } catch (err) {
      log("[theme] probe failed: " + err.message);
    }
  });
  return win;
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (!win.webContents.getURL()) return; // 还没加载，等 OnTick 里加载
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function loadUI() {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.getURL() === URL) return;
  win.loadURL(URL).catch((err) => log("[window] load failed: " + err.message));
}

function rebuildTray(up) {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  const icon = nativeImage.createFromPath(up ? ICON_RUNNING : ICON_STOPPED);
  tray = new Tray(icon);
  tray.setToolTip(up ? "ARTEX 正在运行" : "ARTEX 已停止");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开", click: () => showWindow() },
      { label: "重启", click: () => restart() },
      { type: "separator" },
      { label: "退出", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
  tray.on("double-click", () => showWindow());
}

async function restart() {
  log("[lifecycle] restart requested");
  if (win && !win.isDestroyed()) {
    win.webContents.loadURL("about:blank").catch(() => {});
  }
  ctrl.stop();
  downTicks = 0;
  everUp = false;
  rebuildTray(false);
  const ok = await ctrl.ensureRunning();
  log("[lifecycle] restart backend ok=" + ok);
  if (ok) {
    loadUI();
  }
}

function quit() {
  if (quitting) return;
  quitting = true;
  log("[lifecycle] quit requested");
  try {
    ctrl?.stop();
  } catch (err) {
    log("[lifecycle] stop failed: " + err.message);
  }
  if (tickTimer) clearInterval(tickTimer);
  tray?.destroy();
  tray = null;
  app.quit();
}

async function tick() {
  if (quitting) return;
  const up = await ctrl.isUp();
  if (up) {
    downTicks = 0;
    if (!everUp) {
      everUp = true;
      rebuildTray(true);
      loadUI();
      log("[lifecycle] backend up, window loaded");
    }
  } else {
    if (everUp) {
      downTicks += 1;
      if (downTicks >= 2) {
        // 后端真的没了：按"图标存在 ⇔ ARTEX 在跑"的约定收摊
        log("[lifecycle] backend down twice, quitting");
        quit();
      }
    }
  }
}

// ---- 单实例 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("window-all-closed", (e) => {
    // 托盘常驻：不因关窗退出
    e.preventDefault?.();
  });
  app.on("before-quit", () => {
    quitting = true;
  });

  app.whenReady().then(async () => {
    const execPath = app.isPackaged ? process.execPath : path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
    const installDir = backend.resolveInstallDir(execPath);
    ctrl = backend.createController(installDir, log);
    log(`[boot] installDir=${installDir} silent=${SILENT}`);

    await seedThemeFromSystem();
    createWindow();
    rebuildTray(false);
    tickTimer = setInterval(tick, 2000);

    const ok = await ctrl.ensureRunning();
    log("[boot] ensureRunning ok=" + ok);
    if (ok) {
      everUp = true;
      rebuildTray(true);
      loadUI();
    } else if (!SILENT) {
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<body style="font:14px system-ui;background:#0b0b0c;color:#e5e5e5;padding:32px">
               <h2>ARTEX 后端没起来</h2>
               <p>找不到 artex.exe，或端口 8787 起不来。</p>
               <p>请确认安装目录（可用 ARTEX_HOME 指定），然后从托盘菜单「重启」。</p>
             </body>`,
          ),
      );
      win.show();
    }
  });
}
