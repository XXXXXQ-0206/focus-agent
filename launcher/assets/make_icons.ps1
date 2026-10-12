# 从 ARTEX 的 PNG 图标生成多尺寸 .ico：artex_app.ico / artex_running.ico / artex_stopped.ico
# （stopped 版做灰度+压暗处理，用于"ARTEX 已停止"的托盘状态）
param(
    [string]$Source = 'C:\artex-ymh\web\out\icon.png',
    [string]$OutDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sizes = 16, 24, 32, 48, 64, 128, 256

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    # 逗号包裹：避免 PowerShell 把返回的字节数组展开成 Object[]
    return , $ms.ToArray()
}

function Convert-ToDimGray([System.Drawing.Bitmap]$src) {
    $gray = New-Object System.Drawing.Bitmap($src.Width, $src.Height)
    for ($y = 0; $y -lt $src.Height; $y++) {
        for ($x = 0; $x -lt $src.Width; $x++) {
            $c = $src.GetPixel($x, $y)
            $lum = [int](0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B)
            $lum = [int]($lum * 0.55)
            $gray.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $lum, $lum, $lum))
        }
    }
    return $gray
}

function Write-Ico([string]$Path, [System.Drawing.Image]$Source, [bool]$DimGray) {
    $entries = @()
    foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($s, $s)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($Source, 0, 0, $s, $s)
        $g.Dispose()
        if ($DimGray) {
            $dim = Convert-ToDimGray $bmp
            $bmp.Dispose()
            $bmp = $dim
        }
        [byte[]]$png = Get-PngBytes $bmp
        $entries += @{ Size = $s; Data = $png }
        $bmp.Dispose()
    }

    $fs = [System.IO.File]::Create($Path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$entries.Count)
    $offset = 6 + 16 * $entries.Count
    foreach ($e in $entries) {
        $s = [int]$e.Size
        $dim = if ($s -ge 256) { 0 } else { $s }
        $bw.Write([byte]$dim); $bw.Write([byte]$dim)
        $bw.Write([byte]0); $bw.Write([byte]0)
        $bw.Write([UInt16]1); $bw.Write([UInt16]32)
        $bw.Write([UInt32]([byte[]]$e.Data).Length); $bw.Write([UInt32]$offset)
        $offset += ([byte[]]$e.Data).Length
    }
    foreach ($e in $entries) { $bw.Write([byte[]]$e.Data) }
    $bw.Flush(); $bw.Close()
    Write-Host "wrote $Path ($([math]::Round((Get-Item $Path).Length/1KB,1)) KB)"
}

$src = [System.Drawing.Image]::FromFile($Source)
try {
    Write-Ico (Join-Path $OutDir 'artex_app.ico') $src $false
    Write-Ico (Join-Path $OutDir 'artex_running.ico') $src $false
    Write-Ico (Join-Path $OutDir 'artex_stopped.ico') $src $true
}
finally {
    $src.Dispose()
}
