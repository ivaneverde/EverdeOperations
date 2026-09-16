#Requires -Version 5.1
<#
.SYNOPSIS
  Build Juanita-format Everde Freight Data YTD .xlsb from the newest Oracle Load Board dump
  in Freight\WeeklyDrop\archive.

.DESCRIPTION
  Oracle dumps land in:
    \\192.168.190.10\Claude Sandbox\DataDrops\Freight\WeeklyDrop\archive

  Output (same naming as Juanita's files) lands in:
    \\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\Freight Load Board Reports\Load Board Reports\2026

  Uses the newest existing Everde Freight Data*.xlsb as the template (formulas, Lookup Tab, pivots).

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

$script = Join-Path $PSScriptRoot "build_load_board.py"
$pyArgs = @($script, "--from-archive")
if ($Force) { $pyArgs += "--force" }
if ($SkipPivots) { $pyArgs += "--skip-pivots" }
if ($Source) { $pyArgs += @("--source", $Source) }

Write-Host "Building Load Board from Oracle archive dump..." -ForegroundColor Cyan
& $python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
