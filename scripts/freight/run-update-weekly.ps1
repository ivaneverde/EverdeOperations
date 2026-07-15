#Requires -Version 5.1
<#
.SYNOPSIS
  Patch update.py (if needed), run Freight pipeline from WeeklyDrop raw files.

.EXAMPLE
  npm run freight:update-weekly
  npm run freight:update-weekly -- -SkipFuelCheck
  npm run freight:update-weekly -- -NonInteractive   # same as -SkipFuelCheck (for schedulers)
#>
param(
  [switch]$SkipFuelCheck,
  [switch]$SkipQualityCheck,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

& (Join-Path $PSScriptRoot "patch-update-weeklydrop.ps1")

$pipelineDir = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight\_pipeline"
$updatePy = Join-Path $pipelineDir "update.py"
$weekly = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight\WeeklyDrop"

$count = @(Get-ChildItem -LiteralPath $weekly -Filter "Everde Freight Data*.xlsb" -File -ErrorAction SilentlyContinue).Count
if ($count -lt 1) {
  Write-Host "No raw files in WeeklyDrop: $weekly" -ForegroundColor Red
  Write-Host "Drop Everde Freight Data*.xlsb there, or run: npm run freight:migrate-weeklydrop" -ForegroundColor Yellow
  exit 1
}
Write-Host "WeeklyDrop has $count raw .xlsb file(s)." -ForegroundColor Cyan

$python = $env:FREIGHT_PYTHON
if (-not $python) { $python = "python" }

# Windows consoles often use cp1252; update.py prints emoji/unicode in fuel checks.
if (-not $env:PYTHONUTF8) { $env:PYTHONUTF8 = "1" }
if (-not $env:PYTHONIOENCODING) { $env:PYTHONIOENCODING = "utf-8" }

if ($NonInteractive) { $SkipFuelCheck = $true }

$args = @($updatePy)
if ($SkipFuelCheck) { $args += "--skip-fuel-check" }
if ($SkipQualityCheck) { $args += "--skip-quality-check" }

Push-Location $pipelineDir
try {
  Write-Host "Running update.py (long-running)..." -ForegroundColor Cyan
  & $python @args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host "Pipeline finished. Publish JSON with: npm run freight:extract-publish" -ForegroundColor Green
