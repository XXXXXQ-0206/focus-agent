using System.Drawing;
using System.Runtime.InteropServices;

namespace ArtexLauncher;

/// <summary>
/// 原生 Win32 系统托盘：Shell_NotifyIcon + 原生弹出菜单 + DWM 沉浸式深色模式。
/// 托盘图标 = ARTEX 在运行；图标消失 = ARTEX 已关。
/// </summary>
public sealed class ArtexTrayIconService : IDisposable
{
    private const int NifMessage = 0x00000001;
    private const int NifIcon = 0x00000002;
    private const int NifTip = 0x00000004;
    private const int NimAdd = 0x00000000;
    private const int NimModify = 0x00000001;
    private const int NimDelete = 0x00000002;
    private const int WmApp = 0x8000;
    private const int WmTrayIcon = WmApp + 1;
    private const int WmActivate = WmApp + 2;
    private const int WmQuit = WmApp + 3;
    private const int WmCommand = 0x0111;
    private const int WmDestroy = 0x0002;
    private const int WmRButtonUp = 0x0205;
    private const int WmLButtonUp = 0x0202;
    private const int WmLButtonDblClk = 0x0203;
    private const int TpmLeftAlign = 0x0000;
    private const int TpmBottomAlign = 0x0020;
    private const int TpmRightButton = 0x0002;
    private const int MiimState = 0x00000001;
    private const int MiimId = 0x00000002;
    private const int MiimSubmenu = 0x00000004;
    private const int MiimType = 0x00000010;
    private const int MftString = 0x00000000;
    private const int MftSeparator = 0x00000800;
    private const int MfsEnabled = 0x00000000;
    private const int MfsDisabled = 0x00000003;
    private const int MfsChecked = 0x00000008;
    private const int MfsUnchecked = 0x00000000;
    private const int DwmwaUseImmersiveDarkMode = 20;

    private const int IdOpen = 1001;
    private const int IdRestart = 1002;
    private const int IdExit = 1999;

    private readonly string _windowClassName = $"ArtexLauncher.TrayWindow.{Guid.NewGuid():N}";
    private readonly WndProc _wndProc;
    private readonly Icon _icon;
    private readonly nint _windowHandle;
    private readonly uint _windowClassAtom;
    private readonly uint _taskbarCreatedMessage;
    private bool _iconShown;

    public ArtexTrayIconService(Icon icon)
    {
        _wndProc = WindowProc;
        _windowClassAtom = RegisterWindowClass(_windowClassName, _wndProc);
        if (_windowClassAtom == 0)
            throw new InvalidOperationException("Failed to register tray window class.");

        _windowHandle = CreateMessageWindow(_windowClassAtom, _windowClassName);
        if (_windowHandle == 0)
            throw new InvalidOperationException("Failed to create tray message window.");

        _taskbarCreatedMessage = RegisterWindowMessage("TaskbarCreated");
        _icon = icon;
    }

    /// <summary>打开页面（左键单击 / 双击，或菜单“打开”）。</summary>
    public event Action? OpenRequested;

    /// <summary>退出启动器。</summary>
    public event Action? ExitRequested;

    /// <summary>重启 ARTEX（停止并重新拉起服务）。</summary>
    public event Action? RestartRequested;

    public void ShowContextMenu() => ShowContextMenuCore();

    /// <summary>点亮托盘图标（仅在 ARTEX 就绪后调用）。</summary>
    public void ShowIcon()
    {
        if (_iconShown)
            return;
        AddTrayIcon(_icon, "ARTEX");
        _iconShown = true;
    }

    /// <summary>隐藏托盘图标。</summary>
    public void HideIcon()
    {
        if (!_iconShown)
            return;
        RemoveTrayIcon();
        _iconShown = false;
    }

    /// <summary>让主实例打开页面（可由后台线程安全调用）。</summary>
    public void PostActivate()
    {
        if (_windowHandle != 0)
            PostMessage(_windowHandle, WmActivate, 0, 0);
    }

    /// <summary>让主实例退出（停止 ARTEX 后退出，可由后台线程安全调用）。</summary>
    public void PostQuit()
    {
        if (_windowHandle != 0)
            PostMessage(_windowHandle, WmQuit, 0, 0);
    }

    public void Dispose()
    {
        if (_iconShown)
            RemoveTrayIcon();
        if (_windowHandle != 0)
            DestroyWindow(_windowHandle);
        if (_windowClassAtom != 0)
            UnregisterClass(_windowClassName, GetModuleHandle(null));
        _icon.Dispose();
    }

    private void ShowContextMenuCore()
    {
        var menu = BuildMenu();
        if (menu == 0)
            return;

        try
        {
            TryEnableDarkMode(menu);
            if (!GetCursorPos(out var point))
                return;

            SetForegroundWindow(_windowHandle);
            TrackPopupMenuEx(menu, TpmLeftAlign | TpmBottomAlign | TpmRightButton,
                point.X, point.Y, _windowHandle, nint.Zero);
            PostMessage(_windowHandle, 0, 0, 0);
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    private nint BuildMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == 0)
            return 0;

        try
        {
            AppendActionItem(menu, IdOpen, "打开");
            AppendActionItem(menu, IdRestart, "重启");
            AppendSeparator(menu);
            AppendActionItem(menu, IdExit, "退出");
            return menu;
        }
        catch
        {
            DestroyMenu(menu);
            throw;
        }
    }

    private static void AppendActionItem(nint menu, uint id, string text)
        => AppendMenuItem(menu, id, text, enabled: true, isChecked: false, subMenu: 0, isSeparator: false);

    private static void AppendSeparator(nint menu)
        => AppendMenuItem(menu, 0, string.Empty, enabled: false, isChecked: false, subMenu: 0, isSeparator: true);

    private static void AppendMenuItem(nint menu, uint id, string text, bool enabled, bool isChecked, nint subMenu, bool isSeparator)
    {
        var item = new MENUITEMINFO
        {
            cbSize = (uint)Marshal.SizeOf<MENUITEMINFO>(),
            fMask = MiimId | MiimState | MiimType
        };

        if (isSeparator)
        {
            item.fType = MftSeparator;
            item.fState = MfsDisabled;
        }
        else
        {
            item.fType = MftString;
            item.fState = (uint)((enabled ? MfsEnabled : MfsDisabled) | (isChecked ? MfsChecked : MfsUnchecked));
            item.wID = id;
            item.dwTypeData = text;
            item.cch = (uint)text.Length;
        }

        if (subMenu != 0)
        {
            item.fMask |= MiimSubmenu;
            item.hSubMenu = subMenu;
            item.fState = MfsEnabled;
            item.dwTypeData = text;
            item.cch = (uint)text.Length;
        }

        if (!InsertMenuItem(menu, uint.MaxValue, true, ref item))
            throw new InvalidOperationException("Failed to insert tray menu item.");
    }

    private void TryEnableDarkMode(nint menu)
    {
        try
        {
            var enabled = 1;
            DwmSetWindowAttribute(_windowHandle, DwmwaUseImmersiveDarkMode, ref enabled, sizeof(int));
            if (SetPreferredAppMode is not null)
                SetPreferredAppMode(PreferredAppMode.AllowDark);
            if (FlushMenuThemes is not null)
                FlushMenuThemes();
            if (AllowDarkModeForWindow is not null)
                AllowDarkModeForWindow(_windowHandle, true);
        }
        catch
        {
            // 不支持深色模式的旧系统静默忽略
        }
    }

    private void AddTrayIcon(Icon icon, string tooltip)
    {
        var data = CreateNotifyIconData(icon, tooltip);
        if (!Shell_NotifyIcon(NimAdd, ref data))
            throw new InvalidOperationException("Failed to add tray icon.");
    }

    private void ReAddTrayIcon()
    {
        var data = CreateNotifyIconData(_icon, "ARTEX");
        Shell_NotifyIcon(NimAdd, ref data);
        _iconShown = true;
    }

    private void RemoveTrayIcon()
    {
        var data = CreateNotifyIconData(_icon, string.Empty);
        Shell_NotifyIcon(NimDelete, ref data);
    }

    private NOTIFYICONDATA CreateNotifyIconData(Icon icon, string tooltip)
        => new()
        {
            cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(),
            hWnd = _windowHandle,
            uID = 1,
            uFlags = NifMessage | NifIcon | NifTip,
            uCallbackMessage = WmTrayIcon,
            hIcon = icon.Handle,
            szTip = TrimTooltip(tooltip)
        };

    private nint WindowProc(nint hwnd, uint msg, nuint wParam, nint lParam)
    {
        if (msg == _taskbarCreatedMessage)
        {
            ReAddTrayIcon();
            return 0;
        }

        switch (msg)
        {
            case WmTrayIcon:
                HandleTrayMouseMessage((int)lParam);
                return 0;
            case WmActivate:
                OpenRequested?.Invoke();
                return 0;
            case WmQuit:
                ExitRequested?.Invoke();
                return 0;
            case WmCommand:
                HandleCommand((int)(wParam.ToUInt64() & 0xFFFF));
                return 0;
            case WmDestroy:
                RemoveTrayIcon();
                return 0;
        }

        return DefWindowProc(hwnd, msg, wParam, lParam);
    }

    private void HandleTrayMouseMessage(int message)
    {
        switch (message)
        {
            case WmRButtonUp:
                ShowContextMenuCore();
                break;
            case WmLButtonUp:
            case WmLButtonDblClk:
                OpenRequested?.Invoke();
                break;
        }
    }

    private void HandleCommand(int id)
    {
        switch (id)
        {
            case IdOpen:
                OpenRequested?.Invoke();
                break;
            case IdRestart:
                RestartRequested?.Invoke();
                break;
            case IdExit:
                ExitRequested?.Invoke();
                break;
        }
    }

    private static string TrimTooltip(string text)
    {
        const int max = 127;
        return text.Length <= max ? text : text[..max];
    }

    private static uint RegisterWindowClass(string className, WndProc wndProc)
    {
        var module = GetModuleHandle(null);
        var windowClass = new WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = wndProc,
            hInstance = module,
            lpszClassName = className
        };
        return RegisterClassEx(ref windowClass);
    }

    private static nint CreateMessageWindow(uint atom, string className)
        => CreateWindowEx(0, className, className, 0, 0, 0, 0, 0, 0, 0, GetModuleHandle(null), 0);

    private enum PreferredAppMode { Default, AllowDark }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate PreferredAppMode SetPreferredAppModeDelegate(PreferredAppMode appMode);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void FlushMenuThemesDelegate();

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate bool AllowDarkModeForWindowDelegate(nint hwnd, bool allow);

    private static readonly SetPreferredAppModeDelegate? SetPreferredAppMode = LoadUxThemeDelegate<SetPreferredAppModeDelegate>(135);
    private static readonly FlushMenuThemesDelegate? FlushMenuThemes = LoadUxThemeDelegate<FlushMenuThemesDelegate>(136);
    private static readonly AllowDarkModeForWindowDelegate? AllowDarkModeForWindow = LoadUxThemeDelegate<AllowDarkModeForWindowDelegate>(133);

    private static TDelegate? LoadUxThemeDelegate<TDelegate>(int ordinal)
        where TDelegate : Delegate
    {
        var module = LoadLibrary("uxtheme.dll");
        if (module == 0)
            return null;
        var address = GetProcAddress(module, (nint)ordinal);
        return address == 0 ? null : Marshal.GetDelegateForFunctionPointer<TDelegate>(address);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public uint cbSize;
        public nint hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public nint hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szTip;
        public uint dwState;
        public uint dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szInfo;
        public uint uVersionOrTimeout;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public nint hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MENUITEMINFO
    {
        public uint cbSize;
        public uint fMask;
        public uint fType;
        public uint fState;
        public uint wID;
        public nint hSubMenu;
        public nint hbmpChecked;
        public nint hbmpUnchecked;
        public nuint dwItemData;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string dwTypeData;
        public uint cch;
        public nint hbmpItem;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public uint cbSize;
        public uint style;
        public WndProc lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public nint hInstance;
        public nint hIcon;
        public nint hCursor;
        public nint hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string? lpszMenuName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string lpszClassName;
        public nint hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    private delegate nint WndProc(nint hWnd, uint msg, nuint wParam, nint lParam);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern bool Shell_NotifyIcon(uint dwMessage, ref NOTIFYICONDATA lpData);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint RegisterClassEx(ref WNDCLASSEX lpwcx);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool UnregisterClass(string lpClassName, nint hInstance);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateWindowEx(int dwExStyle, string lpClassName, string lpWindowName,
        int dwStyle, int x, int y, int nWidth, int nHeight, nint hWndParent, nint hMenu,
        nint hInstance, nint lpParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyWindow(nint hWnd);

    [DllImport("user32.dll")]
    private static extern nint DefWindowProc(nint hWnd, uint msg, nuint wParam, nint lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetForegroundWindow(nint hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(nint hWnd, uint msg, nuint wParam, nint lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern nint CreatePopupMenu();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyMenu(nint hMenu);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool InsertMenuItem(nint hMenu, uint item, bool fByPosition, ref MENUITEMINFO lpmi);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool TrackPopupMenuEx(nint hmenu, int uFlags, int x, int y, nint hwnd, nint lptpm);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint RegisterWindowMessage(string lpString);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern nint GetModuleHandle(string? lpModuleName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern nint GetProcAddress(nint hModule, nint lpProcName);

    [DllImport("dwmapi.dll", SetLastError = true)]
    private static extern int DwmSetWindowAttribute(nint hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);
}
