# ARTEX 桌面端（Electron）

参考 `dsh-desktop`（DeepSeek Harness 桌面版）的组织方式：Electron 主进程 + 一个窗口展示本机 Web 控制台 +
系统托盘 + 单实例。与 `C:\artex-ymh\launcher`（C# 托盘启动器）的区别只是"UI 在哪"：
启动器用系统浏览器打开，桌面端把 UI 装进窗口并常驻托盘。

## 行为

| 项 | 说明 |
| --- | --- |
| 启动 | 解析安装目录（`ARTEX_HOME` → exe 同级/上级 → `C:\artex-ymh`）→ 按需拉起 PostgreSQL → 拉起 `artex.exe` → 端口 8787 就绪后加载控制台 |
| 托盘 | 图标存在 ⇔ ARTEX 在跑；右键 `打开 / 重启 / 退出`；单击切回窗口；后端停掉后两个心跳周期自动收摊 |
| 窗口 | 关窗 = 收进托盘（不退出）；外链走系统浏览器 |
| 退出 | 停 ARTEX（进程树 + 端口占用者兜底）→ **只停自己拉起的 PostgreSQL** |
| 单实例 | `app.requestSingleInstanceLock()`，第二次启动只是把已有窗口调到前台 |
| 静默自启 | `ARTEX.exe --silent` 只亮托盘、不弹窗 |

## 开发与打包

```powershell
cd C:\artex-ymh\desktop
npm install                    # electron 43.1.0 命中本机缓存 %LOCALAPPDATA%\electron\Cache
npm start                      # 本地跑（热启动）
npm run pack                   # @electron/packager 出 dist\ARTEX-win32-x64\ARTEX.exe
```

产物是自包含的 Electron 应用（约 250 MB，和 dsh-desktop 同级），不再依赖系统浏览器；
如果只想要"极简常驻 + 用浏览器看"，用 `C:\artex-ymh\launcher\dist\ArtexLauncher.exe`（约 0.2 MB、私有内存 11 MB）。

## 为什么是 Electron

`dsh-desktop` 本身就是 Electron（`AppData\Local\Programs\DeepSeek Harness` 下有 `LICENSE.electron.txt`、
`icudtl.dat`、`v8_context_snapshot.bin`，主程序 233 MB）。本机已有 `electron-v43.1.0-win32-x64.zip` 缓存，
照它的形态做，成本最低、行为最接近。
