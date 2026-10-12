#!/usr/bin/env pwsh
# 在桌面创建 "ARTEX" 快捷方式（双击启动托盘启动器）。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$exe = Join-Path $PSScriptRoot 'dist\ArtexLauncher.exe'
if (-not (Test-Path $exe)) { throw "Not found: $exe. Run build.ps1 first." }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'ARTEX.lnk'
$oldLnk = Join-Path $desktop 'Dsh Web Launcher.lnk'
if (Test-Path $oldLnk) { Remove-Item $oldLnk -Force }

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = Split-Path $exe
$lnk.Description = 'ARTEX 托盘启动器（图标在 = ARTEX 在跑）'
# 图标优先用 dist 里的 artex_app.ico（多尺寸大图）；缺失时退回 exe 内嵌图标
$ico = Join-Path (Split-Path $exe) 'artex_app.ico'
if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" } else { $lnk.IconLocation = "$exe,0" }
$lnk.Save()

Write-Host "Created desktop shortcut: $lnkPath"
