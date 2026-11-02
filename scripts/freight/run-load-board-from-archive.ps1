#Requires -Version 5.1
<#
.SYNOPSIS
  Build Juanita-format Everde Freight Data YTD .xlsb from the newest Oracle Load Board dump
  in Freight\WeeklyDrop\archive.

.DESCRIPTION
  1. Move freight_load_board_*.xls / *.xml from \\10.178.0.201\OracleShare\everde_prod
     into Freight\WeeklyDrop\archive (keeps everde_prod clear for next week).
  2. Convert to Juanita-format Everde Freight Data YTD .xlsb
  3. Write to Load Board Reports\2026 and copy to Freight\WeeklyDrop.

  Uses the newest existing Everde Freight Data*.xlsb as the template (formulas, Lookup Tab,
  Truck Capacity EU fill rates, pivots). Prefer Juanita's "fill rate updated" book on the
  same YTD date so STE/BRA/WIN rates carry forward.

.EXAMPLE
  npm run freight:build-load-board
  powershell -File scripts/freight/run-load-board-from-archive.ps1 -Force
#>
param(
  [switch]$Force,
  [switch]$SkipPivots,
  [string]$Source = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
if (Test-Path -LiteralPath $EnvLocal) {
  Get-Content -LiteralPath $EnvLocal | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path ("Env:" + $matches[1].Trim()) -Value $matches[2].Trim()
    }
  }
}

$python = $env:FREIGHT_PYTHON
if (-not $python) { $python = "python" }
if (-not $env:PYTHONUTF8) { $env:PYTHONUTF8 = "1" }
if (-not $env:PYTHONIOENCODING) { $env:PYTHONIOENCODING = "utf-8" }
if (-not $env:PYTHONUNBUFFERED) { $env:PYTHONUNBUFFERED = "1" }

$stateDir = Join-Path $RepoRoot ".everde-scheduler"
if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}
$lockPath = Join-Path $stateDir "load-board-convert.lock"
if (Test-Path -LiteralPath $lockPath) {
  $lockPid = 0
  try { $lockPid = [int]((Get-Content -LiteralPath $lockPath -TotalCount 1).Trim()) } catch { $lockPid = 0 }
  if ($lockPid -gt 0 -and $null -ne (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
    Write-Host "Load Board convert already running (PID $lockPid). Skipping." -ForegroundColor Yellow
    exit 0
  }
}
Set-Content -LiteralPath $lockPath -Value "$PID`n$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))" -Encoding ASCII

$script = Join-Path $PSScriptRoot "build_load_board.py"
$pyArgs = @($script, "--from-archive")
if ($Force) { $pyArgs += "--force" }
if ($SkipPivots) { $pyArgs += "--skip-pivots" }
if ($Source) { $pyArgs += @("--source", $Source) }

try {
  Write-Host "Building Load Board from Oracle archive dump..." -ForegroundColor Cyan
  & $python @pyArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if (Test-Path -LiteralPath $lockPath) {
    $owner = 0
    try { $owner = [int]((Get-Content -LiteralPath $lockPath -TotalCount 1).Trim()) } catch { $owner = 0 }
    if ($owner -eq $PID -or $owner -eq 0) {
      Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
  }
}
