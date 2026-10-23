//go:build !windows

package main

// ensureHiddenConsole 只在 Windows 上有意义（见 console_windows.go）。
func ensureHiddenConsole() {}
