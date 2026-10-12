#!/usr/bin/env pwsh
# 构建 ARTEX 托盘启动器（WinForms + 原生 Win32 托盘菜单）。
param(
    # 自包含发布：不依赖本机 .NET 运行时，代价是体积从 ~0.2MB 涨到 ~70MB
    [switch]$SelfContained
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# 默认 framework-dependent：本机已装 .NET 9 Windows Desktop Runtime，exe 只有 ~0.2MB
if ($SelfContained) {
    dotnet publish -c Release -f net9.0-windows -o $dist --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
} else {
    dotnet publish -c Release -f net9.0-windows -o $dist
}
if ($LASTEXITCODE -ne 0) { throw "publish failed: $LASTEXITCODE" }

# 快捷方式用的大图图标
Copy-Item (Join-Path $PSScriptRoot 'assets\artex_app.ico') (Join-Path $dist 'artex_app.ico') -Force

$exe = Join-Path $dist 'ArtexLauncher.exe'
Write-Host "Built: $exe"

# Smoke check: --check 只做诊断，不起托盘、不动服务。
$checkFile = Join-Path (Join-Path $env:LOCALAPPDATA 'ArtexLauncher') 'check.txt'
if (Test-Path $checkFile) { Remove-Item $checkFile -Force }
Start-Process -FilePath $exe -ArgumentList '--check' -Wait -WindowStyle Hidden
if (Test-Path $checkFile) {
    Write-Host "--- self check ---"
    Get-Content $checkFile
}
Write-Host "OK"
