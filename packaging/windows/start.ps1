param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ArtexArgs
)

# Windows release wrapper; exit code 75 means an update or rollback is ready.
$ErrorActionPreference = "Stop"
$binary = Join-Path $PSScriptRoot "artex.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Cannot find artex.exe beside $PSCommandPath"
}

$restartCode = 75
$maximumDelay = 60
$delay = 1

while ($true) {
    & $binary @ArtexArgs
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "[artex] Exited normally"
        exit 0
    }

    if ($exitCode -eq $restartCode) {
        Write-Host "[artex] Restart requested to finish update or rollback"
        $delay = 1
        continue
    }

    Write-Warning "[artex] Exited with code $exitCode. Restarting in ${delay}s"
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, $maximumDelay)
}
