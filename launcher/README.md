# ARTEX 托盘启动器（Windows 桌面版）

把 ARTEX（Go 后端 + 内置前端 + 本机 PostgreSQL）包装成一个桌面应用：
**托盘图标存在 ⇔ ARTEX 在跑；图标消失 ⇔ 已经关了。**
实现沿用 `dsh-web-launcher` 的 Windows 等价方案：WinForms + 原生 Win32 托盘菜单（Shell_NotifyIcon + DWM 深色菜单）。

## 核心行为

- **图标即状态**：启动器只在 ARTEX 端口（8787）就绪后才点亮托盘图标；ARTEX 停止后启动器自动退出，图标随之消失。
- **单实例**：命名互斥量 `Local\ArtexLauncher.Singleton`；重复启动只唤醒已有实例（打开页面），不会出现第二个托盘。
- **右键菜单只有三项**：打开 / 重启 / 退出。
- **启动序列**：需要时先拉起本机 PostgreSQL（`pgsql\bin\pg_ctl`，127.0.0.1:5433），再启动 `artex.exe -addr 127.0.0.1:8787 -proxy 127.0.0.1:8788`，就绪后打开浏览器控制台。
- **退出行为**：关闭标题以 `ARTEX` 开头的浏览器窗口 → 停掉 ARTEX（进程树 + 端口占用者）→ **只停"由启动器拉起"的 PostgreSQL**（你自己手动起的库不动）。
- **崩溃自愈**：启动阶段进程提前退出会按 4 次上限自动重试；就绪后端口连续两次探测不通则隐藏图标并退出（不留下"假死图标"）。

## 命令行

| 参数 | 作用 |
| --- | --- |
| （无） | 正常启动：必要时拉起服务，就绪后打开控制台页面 |
| `--silent` | 静默启动：只亮托盘，不打开浏览器（供开机自启） |
| `--quit` | 让已在运行的实例退出（等价于右键→退出） |
| `--check` | 只做诊断，写 `%LOCALAPPDATA%\ArtexLauncher\check.txt`（安装目录 / 服务状态 / PG 状态），不起托盘、不动服务 |

## 安装目录解析

按顺序找含 `artex.exe` 的目录：`ARTEX_HOME` 环境变量 → 启动器 exe 所在目录 → 其上级目录 → `C:\artex-ymh`。

## 构建

```powershell
pwsh -File build.ps1                 # 依赖本机 .NET 9 运行时，产物约 0.2 MB
pwsh -File build.ps1 -SelfContained  # 自包含单文件，约 70 MB，换机器可直接跑
pwsh -File create_shortcut.ps1       # 桌面创建 "ARTEX" 快捷方式
```

图标由 `assets\make_icons.ps1` 从 `web\out\icon.png` 生成（运行态彩色 / 停止态灰度，各 7 个尺寸）。

## 实测资源占用（本机，空载）

| 进程 | 工作集 | 私有内存 |
| --- | --- | --- |
| ArtexLauncher（托盘，1 个） | 57.2 MB | **11.1 MB** |
| artex.exe（1 个） | 50.3 MB | 70.5 MB |
| postgres（8 个进程） | 142.8 MB | 35.4 MB |

- 启动器的轮询开销：每 2 秒读一次 TCP 监听表（`GetExtendedTcpTable`，不发起 HTTP 连接），实测 3 ms 级。
- 想再压：任务并发（workers，默认 3）与流量录制代理（启动参数 `-proxy ""` 可关）是两个可调项。

## 与 dsh-web-launcher 的关系

托盘实现、单实例信号、端口探测、菜单样式都来自 `dsh-web-launcher` 的 Windows 版（CquAutoLogin 同款技术栈），本目录是它的 ARTEX 改写版。
