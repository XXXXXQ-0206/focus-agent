# Focus 桌面端

Electron 主进程负责拉起本机后端、展示 Focus renderer，并提供系统托盘与单实例行为。桌面端与 Web 共用同一套页面，不使用第二套前端。

## 行为

| 项 | 说明 |
| --- | --- |
| 启动 | 解析安装目录（`ARTEX_HOME` → exe 同级/上级 → `C:\artex-ymh`）→ 按需拉起 PostgreSQL → 拉起 `artex.exe` → 端口 8787 就绪后加载 Focus |
| 托盘 | 图标存在 ⇔ Focus 在跑；右键 `打开 / 重启 / 退出`；单击切回窗口；后端停掉后两个心跳周期自动收摊 |
| 窗口 | 关窗 = 收进托盘（不退出）；外链走系统浏览器；不提供旧 Web 控制台切换入口 |
| 服务校验 | TCP 端口就绪后还必须通过 `GET /api/health`，且响应为 `{"ok":true,"service":"artex"}` 才加载页面 |
| 退出 | 停 Focus（进程树 + 端口占用者兜底）→ **只停自己拉起的 PostgreSQL** |
| 单实例 | `app.requestSingleInstanceLock()`，第二次启动只是把已有窗口调到前台 |
| 静默自启 | `Focus.exe --silent` 只亮托盘、不弹窗 |

`ARTEX_HOME`、`artex.exe` 和健康响应中的 `service: "artex"` 是现有部署协议标识；产品界面与窗口标题统一显示 Focus。

## 开发与打包

```powershell
cd desktop
npm install
npm start
npm test
npm run pack
```

`npm run pack` 会生成 `build\Focus-win32-x64\Focus.exe`。桌面宿主只向 renderer 暴露白名单 IPC，主要能力是本机文件或目录选择；页面不会获得 Node.js 权限。

## 窗口与导航

桌面端只加载 `/`。旧 `/artex` 与 `/artex/*` URL 由 Go 服务永久重定向到 `/`，仅用于兼容旧书签。窗口拒绝文件、脚本和其他未知协议，明确的 HTTP/HTTPS 外链才交给系统浏览器。
