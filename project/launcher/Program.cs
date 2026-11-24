using System.Drawing;
using System.Runtime.InteropServices;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace ArtexLauncher;

internal static class Program
{
    private const string GuidUrl = "http://127.0.0.1:8787/";
    private const string Host = "127.0.0.1";
    private const int Port = 8787;
    private const int PgPort = 5433;
    private const int ProbeTimeoutMs = 2000;
    private const int BootTimeoutSec = 90;
    private const int MaxStartAttempts = 4;
    private const string MutexName = @"Local\ArtexLauncher.Singleton";
    private const string ActivateSignalName = @"Local\ArtexLauncher.Activate";
    private const string QuitSignalName = @"Local\ArtexLauncher.Quit";

    [STAThread]
    private static int Main(string[] args)
    {
        // 让原生菜单在高 DPI 缩放下清晰渲染（PerMonitorV2），避免位图拉伸发糊
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try { Application.SetHighDpiMode(HighDpiMode.PerMonitorV2); } catch { }

        bool check = args.Length > 0 && string.Equals(args[0], "--check", StringComparison.OrdinalIgnoreCase);
        bool quit = args.Any(a => string.Equals(a, "--quit", StringComparison.OrdinalIgnoreCase));
        bool silent = args.Any(a => string.Equals(a, "--silent", StringComparison.OrdinalIgnoreCase));

        if (check)
        {
            WriteCheck();
            return 0;
        }

        bool owned;
        using (var mutex = new Mutex(true, MutexName, out owned))
        {
            if (!owned)
            {
                // Autostart instance: if the tray is already running, do not
                // foreground a browser page just because Windows re-launched us.
                if (silent)
                    return 0;
                try
                {
                    if (quit)
                        EventWaitHandle.OpenExisting(QuitSignalName).Set();
                    else
                        EventWaitHandle.OpenExisting(ActivateSignalName).Set();
                }
                catch
                {
                }
                return 0;
            }

            if (quit)
                return 0; // 没有在跑的主实例，无需退出

            Application.Run(new TrayApp(silent));
        }
        return 0;
    }

    private static string LogPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                     "ArtexLauncher", "launcher.log");

    private static Icon LoadTrayIcon()
    {
        var asm = Assembly.GetExecutingAssembly();
        var name = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("artex_running.ico", StringComparison.OrdinalIgnoreCase));
        if (name is not null)
        {
            using var s = asm.GetManifestResourceStream(name);
            if (s is not null)
                return new Icon(s, 32, 32);
        }
        return (Icon)SystemIcons.Application.Clone();
    }

    private static void OpenPage(bool startedByUs)
    {
        // ARTEX 面板地址固定；loopback 监听时不需要门控令牌。
        var url = GuidUrl;
        _ = startedByUs;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
        }
    }

    private static bool IsServiceUp()
    {
        // 直接查 TCP 监听表：瞬时、不发起连接，因此 ARTEX 未运行也不会挂 2s。
        var listening = IsPortListening(Port);
        if (listening is not null)
            return listening.Value;

        // 仅当读取 TCP 表失败（API 不可用）时才回退到短超时连接
        var tcp = new TcpClient();
        try
        {
            var task = tcp.ConnectAsync(Host, Port);
            if (!task.Wait(300))
                return false;
            return tcp.Connected;
        }
        catch
        {
            return false;
        }
        finally
        {
            tcp.Close();
        }
    }

    private static bool? IsPortListening(int port)
    {
        const int AfInet = 2;
        const int TcpTableOwnerPidListener = 3;
        int size = 0;
        // 第一次调用用于取得所需缓冲区大小（会返回 ERROR_INSUFFICIENT_BUFFER）
        if (GetExtendedTcpTable(IntPtr.Zero, ref size, false, AfInet, TcpTableOwnerPidListener, 0) != 0 && size == 0)
            return null;

        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(buffer, ref size, false, AfInet, TcpTableOwnerPidListener, 0) != 0)
                return null;

            var count = Marshal.ReadInt32(buffer);
            var baseAddr = buffer.ToInt64() + sizeof(uint);
            var rowSize = Marshal.SizeOf<MIB_TCPROW_OWNER_PID>();
            for (var i = 0; i < count; i++)
            {
                var row = Marshal.PtrToStructure<MIB_TCPROW_OWNER_PID>(new IntPtr(baseAddr + (long)i * rowSize));
                var low = row.dwLocalPort & 0xFFFF;
                var p = (int)(((low >> 8) & 0xFF) | ((low & 0xFF) << 8));
                if (p == port && row.dwState == 2) // MIB_TCP_STATE_LISTEN
                    return true;
            }
            return false;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MIB_TCPROW_OWNER_PID
    {
        public uint dwState;
        public uint dwLocalAddr;
        public uint dwLocalPort;
        public uint dwRemoteAddr;
        public uint dwRemotePort;
        public uint dwOwningPid;
    }

    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern int GetExtendedTcpTable(IntPtr pTcpTable, ref int pdwSize, bool bOrder, int ulAf, int TableClass, int Reserved);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    private delegate bool EnumWindowsProc(nint hWnd, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(nint hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(nint hWnd, System.Text.StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(nint hWnd, uint msg, nint wParam, nint lParam);

    private const int WmClose = 0x0010;

    /// <summary>
    /// 解析 ARTEX 安装目录（含 artex.exe 的那个目录）。
    /// 顺序：ARTEX_HOME 环境变量 → 本启动器所在目录 → 其上级目录 → C:\artex-ymh 默认值。
    /// </summary>
    private static string? FindArtexInstall()
    {
        var candidates = new List<string?>();
        try
        {
            candidates.Add(Environment.GetEnvironmentVariable("ARTEX_HOME"));
        }
        catch
        {
        }

        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        candidates.Add(exeDir);
        if (!string.IsNullOrEmpty(exeDir))
            candidates.Add(Directory.GetParent(exeDir!)?.FullName);
        candidates.Add(@"C:\artex-ymh");

        foreach (var c in candidates)
        {
            if (string.IsNullOrWhiteSpace(c))
                continue;
            try
            {
                if (File.Exists(Path.Combine(c!, "artex.exe")))
                    return Path.GetFullPath(c!);
            }
            catch
            {
            }
        }
        return null;
    }

    private static void WriteCheck()
    {
        try
        {
            var swFind = System.Diagnostics.Stopwatch.StartNew();
            var install = FindArtexInstall();
            swFind.Stop();
            var swUp = System.Diagnostics.Stopwatch.StartNew();
            var up = IsServiceUp();
            swUp.Stop();
            var pgOk = false;
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("netstat", "-ano")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true
                };
                using var p = System.Diagnostics.Process.Start(psi);
                if (p is not null)
                {
                    var output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    pgOk = output.Contains(":5433") && output.Contains("LISTENING");
                }
            }
            catch
            {
            }
            var dir = Path.GetDirectoryName(LogPath) ?? string.Empty;
            Directory.CreateDirectory(dir);
            var text = "artex install: " + (install ?? "NOT FOUND") +
                       "\nservice: " + (up ? "up" : "down") +
                       "\npostgres: " + (pgOk ? "up" : "down") +
                       "\nartex exe: " + (install is null ? "n/a" : Path.Combine(install, "artex.exe")) +
                       "\nfind: " + swFind.ElapsedMilliseconds + " ms" +
                       "\nisUp: " + swUp.ElapsedMilliseconds + " ms";
            File.WriteAllText(Path.Combine(dir, "check.txt"), text, Encoding.UTF8);
        }
        catch
        {
        }
    }

    /// <summary>
    /// 关闭标题以 ARTEX 开头的浏览器窗口（对应 ARTEX 控制台页面）。
    /// 仅按窗口标题匹配，避免误关其他窗口。
    /// </summary>
    private static void CloseArtexBrowserWindows()
    {
        try
        {
            EnumWindows((hWnd, _) =>
            {
                if (IsWindow(hWnd))
                {
                    var sb = new System.Text.StringBuilder(512);
                    GetWindowText(hWnd, sb, sb.Capacity);
                    if (sb.ToString().StartsWith("ARTEX", StringComparison.OrdinalIgnoreCase))
                        PostMessage(hWnd, WmClose, nint.Zero, nint.Zero);
                }
                return true;
            }, nint.Zero);
        }
        catch
        {
        }
    }

    private sealed class TrayApp : ApplicationContext
    {
        private readonly ArtexTrayIconService? _tray;
        private readonly System.Windows.Forms.Timer _timer;
        private readonly CancellationTokenSource _cts = new();
        private EventWaitHandle? _activate;
        private EventWaitHandle? _quit;
    private bool _starting;
    private int _startAttempts;
    private bool _startedByUs;
        private bool _openedAfterStart;
        private bool _everUp;
        private DateTime _startedAt = DateTime.MinValue;
        private int _downTicks;
        private bool _forceShutdown;
        private bool _silentStart;
        private System.Diagnostics.Process? _artexProcess;
        private bool _pgStartedByUs;

        public TrayApp(bool silentStart)
        {
            _silentStart = silentStart;
            // 0) 单实例信号尽早建立，第二实例可立即唤醒/退出
            _activate = new EventWaitHandle(false, EventResetMode.AutoReset, ActivateSignalName);
            _quit = new EventWaitHandle(false, EventResetMode.AutoReset, QuitSignalName);

            // 1) 尽早拉起 ARTEX（若未运行）——启动耗时主要在这里，别让托盘初始化挡在前面
            bool needStart = !IsServiceUp();
            if (needStart)
                StartService();

            // 2) 构建托盘（消息窗口）
            _tray = new ArtexTrayIconService(LoadTrayIcon());
            _tray.OpenRequested += () => OpenPage(_startedByUs);
            _tray.ExitRequested += () => ExitLauncher(stopService: true);
            _tray.RestartRequested += RestartArtex;

            // 3) 监听来自第二实例的信号
            var th = new Thread(() => ListenForSignals()) { IsBackground = true, Name = "ArtexLauncher.SignalListener" };
            th.Start();

            // 4) 若启动前 ARTEX 就在运行，点亮图标并直接打开页面；否则等就绪后由 OnTick 处理
            if (!needStart)
            {
                _everUp = true;
                _tray.ShowIcon();
                if (!_silentStart)
                    OpenPage(_startedByUs);
            }

            // 5) 启动阶段用较快轮询，服务就绪即开页面；就绪后再用 2s 监测。
            _timer = new System.Windows.Forms.Timer { Interval = _starting ? 400 : 2000 };
            _timer.Tick += OnTick;
            _timer.Start();
        }

        private void ListenForSignals()
        {
            while (!_cts.IsCancellationRequested)
            {
                int idx;
                try
                {
                    idx = WaitHandle.WaitAny(new[] { _activate!, _quit! });
                }
                catch
                {
                    return;
                }
                if (idx == 0)
                    _tray?.PostActivate();
                else if (idx == 1)
                {
                    _tray?.PostQuit();
                    return;
                }
            }
        }

        private void OnTick(object? sender, EventArgs e)
        {
            var up = IsServiceUp();
            if (up)
            {
                _downTicks = 0;
                _everUp = true;
                _tray?.ShowIcon();
                if (_starting && !_openedAfterStart)
                {
                    _openedAfterStart = true;
                    if (!_silentStart)
                        OpenPage(_startedByUs);
                }
                _starting = false;
                _startedByUs = false;
                _timer.Interval = 2000;
            }
            else
            {
                if (_starting)
                {
                    _timer.Interval = 400;
                    // ARTEX 偶发启动失败（数据库还在恢复、端口被占等）：检测到进程已退出
                    // 而端口仍未就绪时自动重试，避免用户看到"图标不见了"却不知道为什么。
                    if (_artexProcess is { HasExited: true })
                    {
                        if (_startAttempts < MaxStartAttempts)
                        {
                            _startAttempts++;
                            _startedAt = DateTime.Now;
                            _openedAfterStart = false;
                            if (!StartArtex())
                            {
                                ShowFatal("未找到 artex.exe。\n\n请把本启动器放到 ARTEX 安装目录（含 artex.exe），或设置 ARTEX_HOME 环境变量后重试。");
                                ExitLauncher(stopService: false);
                            }
                            return;
                        }
                        ShowFatal($"ARTEX 启动失败（已重试 {_startAttempts} 次）。\n\n请查看日志：\n{LogPath}");
                        ExitLauncher(stopService: true);
                        return;
                    }
                    if ((DateTime.Now - _startedAt).TotalSeconds > BootTimeoutSec)
                    {
                        ShowFatal($"ARTEX 启动超时。\n\n请查看日志：\n{LogPath}");
                        ExitLauncher(stopService: true);
                    }
                }
                else if (_everUp)
                {
                    _downTicks++;
                    if (_downTicks >= 2)
                    {
                        _tray?.HideIcon();
                        ExitLauncher(stopService: false);
                    }
                }
            }
        }

        private void StartService()
        {
            if (_starting)
                return;
            _starting = true;
            _startAttempts = 0;
            _startedByUs = true;
            _startedAt = DateTime.Now;
            _openedAfterStart = false;

            if (!StartArtex())
            {
                _starting = false;
                _startedByUs = false;
                ShowFatal("未找到 artex.exe。\n\n请把本启动器放到 ARTEX 安装目录（含 artex.exe），或设置 ARTEX_HOME 环境变量后重试。");
                ExitLauncher(stopService: false);
            }
        }

        /// <summary>
        /// 确保本机便携版 PostgreSQL 已在跑（127.0.0.1:5433）。
        /// 已经跑着 → 不动它；由我们拉起的 → 记 _pgStartedByUs，退出时一并停掉。
        /// </summary>
        private bool EnsurePostgres(string install)
        {
            var pgBin = Path.Combine(install, "pgsql", "bin");
            var pgCtl = Path.Combine(pgBin, "pg_ctl.exe");
            var pgData = Path.Combine(install, "data", "pgdata");
            if (!File.Exists(pgCtl) || !Directory.Exists(pgData))
                return true; // 外部数据库部署：不由本启动器管理

            try
            {
                using var probe = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
                    Path.Combine(pgBin, "pg_isready.exe"), "-h " + Host + " -p " + PgPort + " -q")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                });
                probe?.WaitForExit(5000);
                if (probe is not null && probe.ExitCode == 0)
                    return true;
            }
            catch
            {
            }

            try
            {
                using var start = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(pgCtl,
                    "-D \"" + pgData + "\" -l \"" + Path.Combine(install, "data", "pg.log") + "\" -w start")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                });
                start?.WaitForExit(60000);
                _pgStartedByUs = true;
                return true;
            }
            catch (Exception ex)
            {
                ShowFatal($"无法启动 PostgreSQL：{ex.Message}");
                return false;
            }
        }

        private bool StartArtex()
        {
            var install = FindArtexInstall();
            if (install is null)
                return false;

            if (!EnsurePostgres(install))
                return false;

            var dir = Path.GetDirectoryName(LogPath) ?? string.Empty;
            Directory.CreateDirectory(dir);
            try
            {
                File.AppendAllText(LogPath, "");
            }
            catch
            {
            }

            var exe = Path.Combine(install, "artex.exe");
            var outLog = Path.Combine(install, "data", "artex.err.log");
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c \"\"" + exe + "\" -addr " + Host + ":" + Port +
                            " -proxy " + Host + ":8788 >> \"" + outLog + "\" 2>&1\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                WorkingDirectory = install
            };
            try
            {
                _artexProcess = System.Diagnostics.Process.Start(psi);
                return true;
            }
            catch (Exception ex)
            {
                ShowFatal($"无法启动 ARTEX：{ex.Message}");
                return false;
            }
        }

        /// <summary>重启 ARTEX：关闭旧页面、停止服务、重新拉起，启动器保持运行。</summary>
        private void RestartArtex()
        {
            if (_forceShutdown)
                return;
            CloseArtexBrowserWindows(); // 关闭旧的 ARTEX 浏览器窗口（重启后重新打开）
            StopArtex();                // 杀掉当前 artex 进程树
            _starting = false;
            _startedByUs = false;
            _openedAfterStart = false;
            _everUp = false;
            _startAttempts = 0;
            _downTicks = 0;
            _silentStart = false;
            _tray?.HideIcon();
            StartService();             // 重新拉起 ARTEX，就绪后由 OnTick 亮图标并打开页面
        }

        private void ExitLauncher(bool stopService)
        {
            if (_forceShutdown)
                return;
            _forceShutdown = true;
            // 退出清理：关闭 ARTEX 控制台页面
            CloseArtexBrowserWindows();
            if (stopService)
                StopArtex();
            _tray?.HideIcon();
            _timer.Stop();
            ExitThread();
            Environment.Exit(0);
        }

        private void StopArtex()
        {
            if (_artexProcess is { HasExited: false })
                KillTree(_artexProcess.Id);
            var owner = FindTcpOwner(Port);
            if (owner > 0 && owner != Environment.ProcessId)
                KillTree(owner);
            // 确保端口真正释放后再返回，避免重启/退出时残留孤儿、产生第二个实例（EADDRINUSE）
            WaitPortDown();

            // 只停我们自己拉起来的数据库；用户手动起的 PG（或许还有别的用途）不动
            if (_pgStartedByUs)
            {
                var install = FindArtexInstall();
                var pgCtl = install is null ? null : Path.Combine(install, "pgsql", "bin", "pg_ctl.exe");
                if (install is not null && pgCtl is not null && File.Exists(pgCtl))
                {
                    try
                    {
                        using var stop = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(pgCtl,
                            "-D \"" + Path.Combine(install, "data", "pgdata") + "\" stop -m fast")
                        {
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                        });
                        stop?.WaitForExit(20000);
                    }
                    catch
                    {
                    }
                }
                _pgStartedByUs = false;
            }
        }

        private static void WaitPortDown()
        {
            var deadline = DateTime.Now.AddSeconds(6);
            while (DateTime.Now < deadline)
            {
                if (!IsServiceUp())
                    return;
                Thread.Sleep(150);
            }
        }

        private static int FindTcpOwner(int port)
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("netstat", "-ano")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = true
                };
                using var p = System.Diagnostics.Process.Start(psi);
                if (p is null)
                    return 0;
                var output = p.StandardOutput.ReadToEnd();
                if (!p.WaitForExit(3000))
                {
                    try { p.Kill(); } catch { }
                }
                foreach (var line in output.Split('\n'))
                {
                    if (line.Contains(":" + port) && line.Contains("LISTENING"))
                    {
                        var parts = line.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length > 0 && int.TryParse(parts[^1], out var pid))
                            return pid;
                    }
                }
            }
            catch
            {
            }
            return 0;
        }

        private static void KillTree(int pid)
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("taskkill", "/PID " + pid + " /T /F")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                };
                using var tk = System.Diagnostics.Process.Start(psi);
                tk?.WaitForExit(2000);
            }
            catch
            {
            }
        }

        private void ShowFatal(string message)
        {
            if (_silentStart)
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(LogPath) ?? string.Empty);
                    File.AppendAllText(LogPath,
                        $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [silent startup] {message}{Environment.NewLine}");
                }
                catch
                {
                }
                return;
            }
            try
            {
                MessageBox.Show(message, "ARTEX", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch
            {
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _cts.Cancel();
                _activate?.Set();
                _quit?.Set();
                _activate?.Dispose();
                _quit?.Dispose();
                _timer.Dispose();
                _tray?.Dispose();
                _cts.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
