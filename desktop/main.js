// ARTEX 桌面端（Electron 外壳）——参考 dsh-desktop 的组织方式：
//   主进程负责拉起本机后端 + 一个窗口展示控制台 + 托盘图标，单实例。
// 语义与托盘启动器一致：托盘图标存在 ⇔ ARTEX 在跑；退出时回收后端（只停自己拉起的库）。
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  session,
  shell,
} = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const backend = require("./lib/backend");
const {
  APP_ORIGIN,
  UI_ROUTES,
  hasArtexHealthIdentity,
  isLocalAppURL,
  isSafeExternalWebURL,
  uiModeForURL,
} = require("./lib/ui-navigation");

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
let currentUI = "codex";

function uiURL(mode = currentUI) {
  const route = UI_ROUTES[mode] || UI_ROUTES.codex;
  return `${APP_ORIGIN}${route.path}`;
}

/** 通过固定本机 origin 读取后端身份；TCP 端口有响应本身不足以证明是 ARTEX。 */
function verifyBackendHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(`${APP_ORIGIN}/api/health`, { headers: { Accept: "application/json" } }, (res) => {
      let body = "";
      let bodyBytes = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        bodyBytes += Buffer.byteLength(chunk, "utf8");
        if (bodyBytes > 8192) {
          req.destroy();
          resolve(false);
          return;
        }
        body += chunk;
      });
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300 && hasArtexHealthIdentity(body);
        resolve(ok);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

// 主题首帧：桌面端有自己的配置目录（%APPDATA%\ARTEX），拿不到系统浏览器里存的偏好，
// 所以首次运行必须自己播种 —— 否则默认值 light 会让深色系统的用户每次装完都是白屏。
// 用户以后在界面里改过的值优先（存在 theme_mode cookie 里，Electron 会持久化）。
async function seedThemeFromSystem() {
  const url = APP_ORIGIN + "/";
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // preload 是渲染进程唯一的原生通道（暴露 window.codexDesktop.invoke，见 preload.js）
      preload: path.join(__dirname, "preload.js"),
    },
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
    if (!isLocalAppURL(url) && isSafeExternalWebURL(url)) shell.openExternal(url).catch?.(() => {});
    return { action: "deny" };
  });
  // 页面自身尝试跳出本机 ARTEX origin 时也交给系统浏览器；未知协议或文件路径直接拦截。
  win.webContents.on("will-navigate", (event, url) => {
    const mode = uiModeForURL(url);
    if (mode) {
      if (mode !== currentUI) {
        currentUI = mode;
        if (tray) rebuildTray(everUp);
      }
      return;
    }
    event.preventDefault();
    if (isSafeExternalWebURL(url)) shell.openExternal(url).catch?.(() => {});
  });
  // 自证：页面加载完成后回报实际生效的主题（免得"看起来是浅色"只能靠肉眼判断）
  win.webContents.on("did-finish-load", async () => {
    injectUISwitcher();
    try {
      const state = await win.webContents.executeJavaScript(
        "({href: location.href, mode: document.documentElement.getAttribute('data-theme-mode'), dark: document.documentElement.classList.contains('dark'), desktopBridge: Boolean(window.codexDesktop), pickPath: typeof window.codexDesktop?.invoke === 'function'})",
        true,
      );
      log("[theme] window state " + JSON.stringify(state));
    } catch (err) {
      log("[theme] probe failed: " + err.message);
    }
  });
  return win;
}

/**
 * 在两套 renderer 内都放置一个轻量的可见切换器。
 * 直接改 location.href，不引入 IPC，也不让页面获得主进程能力。
 */
function injectUISwitcher() {
  if (!win || win.isDestroyed()) return;
  const codexActive = currentUI === "codex";
  const artexActive = currentUI === "artex";
  const script = `(() => {
    const old = document.getElementById('artex-ui-switcher');
    if (old) old.remove();
    const host = document.createElement('nav');
    host.id = 'artex-ui-switcher';
    host.setAttribute('aria-label', '界面切换');
    host.style.cssText = 'position:fixed;top:12px;right:16px;z-index:2147483647;display:flex;gap:4px;padding:4px;border:1px solid rgba(128,128,128,.35);border-radius:10px;background:rgba(30,30,30,.86);box-shadow:0 4px 16px rgba(0,0,0,.24);font:12px system-ui,sans-serif;backdrop-filter:blur(8px)';
    const make = (label, href, active) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = '切换到 ' + label;
      button.style.cssText = 'border:0;border-radius:7px;padding:5px 9px;color:#eee;background:' + (active ? '#3b82f6' : 'transparent') + ';cursor:' + (active ? 'default' : 'pointer') + ';font:inherit';
      button.addEventListener('mouseenter', () => { if (!active) button.style.background = 'rgba(255,255,255,.14)'; });
      button.addEventListener('mouseleave', () => { if (!active) button.style.background = 'transparent'; });
      if (!active) button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = href;
      });
      host.appendChild(button);
    };
    make('Codex', ${JSON.stringify(`${APP_ORIGIN}/`)}, ${codexActive});
    make('ARTEX Web', ${JSON.stringify(`${APP_ORIGIN}/artex/`)}, ${artexActive});
    document.body.appendChild(host);
  })()`;
  win.webContents.executeJavaScript(script, true).catch((err) => log("[ui] switcher injection failed: " + err.message));
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
  const target = uiURL();
  if (win.webContents.getURL() === target) return;
  win.loadURL(target).catch((err) => log("[window] load failed: " + err.message));
}

function switchUI(mode) {
  if (!UI_ROUTES[mode]) return;
  currentUI = mode;
  log(`[ui] switch to ${mode}`);
  if (tray) rebuildTray(everUp);
  loadUI();
  showWindow();
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
      { label: "打开当前界面", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Codex 风格客户端",
        type: "radio",
        checked: currentUI === "codex",
        click: () => switchUI("codex"),
      },
      {
        label: "原生 ARTEX Web",
        type: "radio",
        checked: currentUI === "artex",
        click: () => switchUI("artex"),
      },
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
  const healthy = ok && (await verifyBackendHealth());
  log(`[lifecycle] restart backend tcp=${ok} health=${healthy}`);
  if (healthy) {
    everUp = true;
    rebuildTray(true);
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
  const up = await verifyBackendHealth();
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

  /**
   * 渲染进程的原生能力入口（唯一通道，白名单分发）。
   *
   * 目前只实现一个action：
   *   `pick-path` { kind?: "file" | "directory", title?: string } → 绝对路径字符串，取消则 null。
   * 用途：设置里的「路径」类字段（如「连接与流量 → 脚本运行时 → Python 解释器」）用
   * 「值文本 + 选择」替换纯文本输入框 —— 值文本来自后端，选择走系统对话框（用户 2026-10-15 要求）。
   * 其余 action 一律返回 undefined：渲染端 desktop-bridge 对未知 action 已有降级路径。
   */
  ipcMain.handle("codex-desktop:invoke", async (event, action, payload) => {
    if (typeof action !== "string") return undefined;
    if (action === "pick-path") {
      const kind = payload && payload.kind === "directory" ? "directory" : "file";
      const title = payload && typeof payload.title === "string" ? payload.title : undefined;
      const owner = BrowserWindow.fromWebContents(event.sender) ?? win ?? undefined;
      try {
        const result = await dialog.showOpenDialog(owner, {
          title,
          properties: kind === "directory" ? ["openDirectory"] : ["openFile"],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      } catch (error) {
        log(`[pick-path] failed: ${error?.message ?? error}`);
        return null;
      }
    }
    return undefined;
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

    const tcpUp = await ctrl.ensureRunning();
    const healthy = tcpUp && (await verifyBackendHealth());
    log(`[boot] ensureRunning tcp=${tcpUp} health=${healthy}`);
    if (healthy) {
      everUp = true;
      rebuildTray(true);
      loadUI();
    } else if (!SILENT) {
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<body style="font:14px system-ui;background:#0b0b0c;color:#e5e5e5;padding:32px">
               <h2>ARTEX 后端没起来</h2>
               <p>找不到 artex.exe、端口 8787 未就绪，或 /api/health 不是 ARTEX 服务。</p>
               <p>请确认安装目录（可用 ARTEX_HOME 指定），然后从托盘菜单「重启」。</p>
             </body>`,
          ),
      );
      win.show();
    }
  });
}
