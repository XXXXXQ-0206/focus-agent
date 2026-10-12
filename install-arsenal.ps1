#requires -Version 5.1
<#
  ARTEX arsenal installer  --  run this as Administrator.

  Why this script exists
  ----------------------
  Windows Defender (PUA / HackTool signatures) silently quarantines most pentest
  binaries as soon as they land in data\tools: naabu, fscan, chisel, ligolo-agent,
  mimikatz, laZagne, winPEAS/linpeas, and the Python side (impacket / pypykatz /
  netexec).  Only an administrator can grant the folder exclusion that stops this.

  What it does
  ------------
    1. adds a Defender path exclusion for the ARTEX install dir (and the download
       staging dir under %TEMP%)
    2. downloads the pinned Windows builds
    3. installs them into <InstallDir>\data\tools with the file names the ARTEX
       manifest expects (both foo.exe and the extension-less hard link "foo")
    4. rebuilds the Python venv (impacket / pypykatz / netexec) and wires up the
       tools\impacket, tools\nxc, tools\pypykatz entries
    5. optionally registers the "shell" tool hints in the running ARTEX instance

  Usage
  -----
    # in an elevated PowerShell:
    powershell -ExecutionPolicy Bypass -File C:\artex-ymh\install-arsenal.ps1
    # and, if you want the shell hints registered in one go:
    powershell -ExecutionPolicy Bypass -File C:\artex-ymh\install-arsenal.ps1 -ArtPassword <你的 ARTEX 登录密码>
#>
[CmdletBinding()]
param(
  [string]$InstallDir = 'C:\artex-ymh',
  [string]$ArtPassword = '',
  [switch]$SkipDefenderExclusion
)

$ErrorActionPreference = 'Stop'
function Info($m) { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Die 'Run this script from an elevated PowerShell (Run as Administrator).' }

if (-not (Test-Path -LiteralPath $InstallDir)) { Die "Install dir not found: $InstallDir" }
$tools = Join-Path $InstallDir 'data\tools'
$dl    = Join-Path $env:TEMP 'artex-tools-dl'
New-Item -ItemType Directory -Force -Path $tools, $dl | Out-Null

# ---------------------------------------------------------------- exclusions
if (-not $SkipDefenderExclusion) {
  try {
    Add-MpPreference -ExclusionPath $InstallDir
    Add-MpPreference -ExclusionPath $dl
    Ok "Defender exclusions added: $InstallDir , $dl"
  } catch {
    Warn "Could not add Defender exclusions: $($_.Exception.Message)"
    Warn 'Binaries may be quarantined again - check Windows Security manually.'
  }
}

# ---------------------------------------------------------------- downloads
$items = @(
  @{ Name = 'naabu.zip';          Url = 'https://github.com/projectdiscovery/naabu/releases/download/v2.6.1/naabu_2.6.1_windows_amd64.zip' },
  @{ Name = 'httpx.zip';          Url = 'https://github.com/projectdiscovery/httpx/releases/download/v1.12.0/httpx_1.12.0_windows_amd64.zip' },
  @{ Name = 'katana.zip';         Url = 'https://github.com/projectdiscovery/katana/releases/download/v1.8.0/katana_1.8.0_windows_amd64.zip' },
  @{ Name = 'fscan.exe';          Url = 'https://github.com/shadow1ng/fscan/releases/download/v2.2.2/fscan_2.2.2_windows_x64.exe' },
  @{ Name = 'gogo.exe';           Url = 'https://github.com/chainreactors/gogo/releases/download/v2.15.0/gogo_windows_amd64.exe' },
  @{ Name = 'chisel.zip';         Url = 'https://github.com/jpillora/chisel/releases/download/v1.12.0/chisel_1.12.0_windows_amd64.zip' },
  @{ Name = 'suo5.exe';           Url = 'https://github.com/zema1/suo5/releases/download/v2.2.0/suo5-windows-amd64.exe' },
  @{ Name = 'ligolo-agent.zip';   Url = 'https://github.com/nicocha30/ligolo-ng/releases/download/v0.9.2/ligolo-ng_agent_0.9.2_windows_amd64.zip' },
  @{ Name = 'ligolo-proxy.zip';   Url = 'https://github.com/nicocha30/ligolo-ng/releases/download/v0.9.2/ligolo-ng_proxy_0.9.2_windows_amd64.zip' },
  @{ Name = 'mimikatz.zip';       Url = 'https://github.com/gentilkiwi/mimikatz/releases/download/2.2.0-20220919/mimikatz_trunk.zip' },
  @{ Name = 'LaZagne.exe';        Url = 'https://github.com/AlessandroZ/LaZagne/releases/download/v2.4.7/LaZagne.exe' },
  @{ Name = 'winPEASx64.exe';     Url = 'https://github.com/peass-ng/PEASS-ng/releases/download/20261008-1580737f/winPEASx64.exe' },
  @{ Name = 'winPEASany.exe';     Url = 'https://github.com/peass-ng/PEASS-ng/releases/download/20261008-1580737f/winPEASany.exe' },
  @{ Name = 'linpeas.sh';         Url = 'https://github.com/peass-ng/PEASS-ng/releases/download/20261008-1580737f/linpeas.sh' },
  @{ Name = 'penelope.py';        Url = 'https://raw.githubusercontent.com/brightio/penelope/v0.21.0/penelope.py' },
  @{ Name = 'suo5-src.tar.gz';    Url = 'https://codeload.github.com/zema1/suo5/tar.gz/refs/tags/v2.2.0' }
)
foreach ($i in $items) {
  $out = Join-Path $dl $i.Name
  Info "downloading $($i.Name)"
  curl.exe -sL --retry 3 --retry-delay 2 --max-time 600 -o $out $i.Url
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out)) { Warn "download failed: $($i.Name)" }
}

# ---------------------------------------------------------------- helpers
function Install-Binary([string]$src, [string]$name) {
  if (-not (Test-Path -LiteralPath $src)) { Warn "missing source for $name"; return }
  $dest = Join-Path $tools $name
  Copy-Item -LiteralPath $src -Destination $dest -Force
  if ($name -match '\.exe$') {
    $plain = $name -replace '\.exe$', ''
    $link  = Join-Path $tools $plain
    if (Test-Path -LiteralPath $link) { [System.IO.File]::Delete($link) }
    New-Item -ItemType HardLink -Path $link -Target $dest | Out-Null
  }
  Ok "$name installed"
}

function Unzip-Find([string]$zip, [string]$pattern, [string]$destDir) {
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  tar.exe -xf $zip -C $destDir
  return Get-ChildItem $destDir -Recurse -File -Filter $pattern | Select-Object -First 1
}

# ---------------------------------------------------------------- go binaries
$stage = Join-Path $dl 'stage'
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($z in @('naabu.zip', 'httpx.zip', 'katana.zip')) {
  $exe = Unzip-Find (Join-Path $dl $z) '*.exe' (Join-Path $stage ($z -replace '\.zip$', ''))
  if ($exe) { Install-Binary $exe.FullName ($z -replace '\.zip$', '.exe') }
}
$exe = Unzip-Find (Join-Path $dl 'chisel.zip') 'chisel.exe' (Join-Path $stage 'chisel'); if ($exe) { Install-Binary $exe.FullName 'chisel.exe' }
$exe = Unzip-Find (Join-Path $dl 'ligolo-agent.zip') 'agent.exe' (Join-Path $stage 'ligolo-agent'); if ($exe) { Install-Binary $exe.FullName 'ligolo-agent.exe' }
$exe = Unzip-Find (Join-Path $dl 'ligolo-proxy.zip') 'proxy.exe' (Join-Path $stage 'ligolo-proxy'); if ($exe) { Install-Binary $exe.FullName 'ligolo-proxy.exe' }

Install-Binary (Join-Path $dl 'fscan.exe')  'fscan.exe'
Install-Binary (Join-Path $dl 'gogo.exe')   'gogo.exe'
Install-Binary (Join-Path $dl 'suo5.exe')   'suo5.exe'
Install-Binary (Join-Path $dl 'LaZagne.exe') 'laZagne.exe'
Install-Binary (Join-Path $dl 'penelope.py') 'penelope.py'

$mk = Unzip-Find (Join-Path $dl 'mimikatz.zip') 'mimikatz.exe' (Join-Path $stage 'mimikatz')
if ($mk) { Install-Binary $mk.FullName 'mimikatz.exe' }

# peass + suo5 payloads
$peass = Join-Path $tools 'peass'
New-Item -ItemType Directory -Force -Path $peass | Out-Null
foreach ($f in @('winPEASx64.exe', 'winPEASany.exe', 'linpeas.sh')) {
  $src = Join-Path $dl $f
  if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $peass $f) -Force }
}
$payloads = Join-Path $tools 'suo5-payloads'
New-Item -ItemType Directory -Force -Path $payloads | Out-Null
$srcRoot = Join-Path $stage 'suo5-src'
New-Item -ItemType Directory -Force -Path $srcRoot | Out-Null
tar.exe -xzf (Join-Path $dl 'suo5-src.tar.gz') -C $srcRoot
$assets = Get-ChildItem $srcRoot -Directory | Select-Object -First 1
if ($assets) {
  foreach ($p in @(@{ s = 'php\suo5.php'; d = 'suo5.php' }, @{ s = 'java\suo5.jsp'; d = 'suo5.jsp' }, @{ s = 'dotnet\suo5.aspx'; d = 'suo5.aspx' })) {
    $src = Join-Path (Join-Path $assets.FullName 'assets') $p.s
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $payloads $p.d) -Force }
  }
  Ok 'suo5 payloads installed'
}

# ---------------------------------------------------------------- python venv
$venv = Join-Path $tools 'postx-venv'
if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe'))) {
  Info 'creating python venv'
  python -m venv $venv
}
$py = Join-Path $venv 'Scripts\python.exe'
Info 'installing python tools (impacket / pypykatz / netexec)'
& $py -m pip install --upgrade pip --index-url https://pypi.tuna.tsinghua.edu.cn/simple | Out-Null
& $py -m pip install impacket pypykatz --index-url https://pypi.tuna.tsinghua.edu.cn/simple
& $py -m pip install "git+https://github.com/Pennyw0rth/NetExec@v1.5.1" --index-url https://pypi.tuna.tsinghua.edu.cn/simple

# manifest entries: tools\impacket (dir), tools\nxc, tools\pypykatz
$imp = Join-Path $tools 'impacket'
if (-not (Test-Path -LiteralPath $imp)) {
  New-Item -ItemType Junction -Path $imp -Target (Join-Path $venv 'Scripts') | Out-Null
}
foreach ($name in @('nxc', 'pypykatz')) {
  $src = Join-Path $venv "Scripts\$name.exe"
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $tools "$name.exe") -Force
    $plain = Join-Path $tools $name
    if (Test-Path -LiteralPath $plain) { [System.IO.File]::Delete($plain) }
    New-Item -ItemType HardLink -Path $plain -Target (Join-Path $tools "$name.exe") | Out-Null
    Ok "$name installed"
  } else {
    Warn "$name.exe was not produced by pip - check the pip output above"
  }
}

# ---------------------------------------------------------------- shell hints
if ($ArtPassword) {
  Info 'registering shell tool hints in the running ARTEX instance'
  $base = 'http://127.0.0.1:8787'
  try {
    $login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' `
      -Body (@{ username = 'ARTEX'; password = $ArtPassword } | ConvertTo-Json) -TimeoutSec 20
    $h = @{ Authorization = "Bearer $($login.token)" }
    $agents = @('worker', 'worker.intranet', 'pentest', 'mainagent')
    $hints = @(
      @{ k = 'naabu'; d = 'ProjectDiscovery 快速端口扫描。用法: C:\artex-ymh\data\tools\naabu.exe -host <目标> -top-ports 1000 -rate 1000 -silent -json -o out.json' },
      @{ k = 'fscan'; d = '内网综合扫描（端口/服务/弱口令）。用法: C:\artex-ymh\data\tools\fscan.exe -h <网段> -p 1-65535 -o result.txt' },
      @{ k = 'chisel'; d = '反向 TCP 隧道。⚠ 走平台 tunnel 子系统部署，不要裸跑。' },
      @{ k = 'ligolo_agent'; d = 'ligolo-ng 目标侧 agent（TUN 组网）。⚠ 走平台 tunnel 子系统部署。' },
      @{ k = 'mimikatz'; d = 'Windows 凭据提取（目标侧投递执行）。用法: mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" exit' },
      @{ k = 'lazagne'; d = '本机保存口令批量提取（目标侧投递执行）。用法: C:\artex-ymh\data\tools\laZagne.exe all -oN' },
      @{ k = 'peass'; d = '提权枚举脚本集。用法: data\tools\peass\winPEASx64.exe（Windows 目标）/ linpeas.sh（Linux 目标，先上传再 sh 执行）' },
      @{ k = 'impacket'; d = 'Windows 协议工具集（Python venv）。用法: C:\artex-ymh\data\tools\postx-venv\Scripts\python.exe C:\artex-ymh\data\tools\impacket\secretsdump.py -h；常用: secretsdump/psexec/wmiexec/smbclient/GetNPUsers/GetUserSPNs/ntlmrelayx。' },
      @{ k = 'nxc'; d = 'NetExec：SMB/WinRM/LDAP 协议执行与口令喷洒。用法: C:\artex-ymh\data\tools\nxc.exe smb <目标> -u user -p pass' },
      @{ k = 'pypykatz'; d = 'LSASS dump 离线解析。用法: C:\artex-ymh\data\tools\pypykatz.exe lsa minidump <lsass.dmp>' }
    )
    foreach ($x in $hints) {
      $body = @{ key = $x.k; description = $x.d; kind = 'shell'; agents = $agents; enabled = $true } | ConvertTo-Json
      try {
        Invoke-RestMethod -Method Post -Uri "$base/api/tools/custom" -Headers $h -ContentType 'application/json; charset=utf-8' `
          -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20 | Out-Null
        Ok "hint registered: $($x.k)"
      } catch {
        Warn "hint failed ($($x.k)): $($_.Exception.Message)"
      }
    }
  } catch {
    Warn "could not register hints: $($_.Exception.Message)"
  }
} else {
  Warn 'no -ArtPassword given: shell tool hints were NOT registered. Re-run with -ArtPassword <your password>, or add them on the Tools page.'
}

# ---------------------------------------------------------------- summary
Write-Host ''
Ok 'arsenal install finished. Current data\tools content:'
Get-ChildItem $tools -File | Sort-Object Name | ForEach-Object { '    {0,-24} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) }
Write-Host ''
Info 'Now verify:  cd C:\artex-ymh ; .\artex.exe doctor'
