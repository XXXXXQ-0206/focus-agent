//go:build windows

package main

import "syscall"

/**
 * ensureHiddenConsole 让后端在**没有控制台**的情况下（桌面端用 windowsHide 拉起时）
 * 自己分配一个**隐藏**的控制台。
 *
 * 为什么必须这么做：agent 的命令工具有一整套 `exec.Command("cmd.exe" / "powershell")`
 * （norma 的 tool/bash.go、shell_session.go、task.go、mcp/stdio.go）。Windows 上
 * CreateProcess 的默认行为是：父进程**没有**控制台 ⇒ 子进程新建一个**可见**的控制台窗口。
 * 从终端启动 artex 时父进程有控制台，子进程直接继承（所以旧版看着"静默"）；
 * 从 Electron 以 windowsHide 启动时父进程没有控制台，于是每跑一条命令就弹一个黑窗。
 *
 * 有了一个（隐藏的）控制台之后，所有子进程都继承它，不再各自开窗。
 * 如果本来就有控制台（用户从终端启动），什么都不做 —— 绝不能去隐藏用户的终端窗口。
 */
func ensureHiddenConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	user32 := syscall.NewLazyDLL("user32.dll")
	getConsoleWindow := kernel32.NewProc("GetConsoleWindow")
	allocConsole := kernel32.NewProc("AllocConsole")
	showWindow := user32.NewProc("ShowWindow")

	if hwnd, _, _ := getConsoleWindow.Call(); hwnd != 0 {
		return
	}
	if ok, _, _ := allocConsole.Call(); ok == 0 {
		return
	}
	if hwnd, _, _ := getConsoleWindow.Call(); hwnd != 0 {
		const swHide = 0
		_, _, _ = showWindow.Call(hwnd, swHide)
	}
}
