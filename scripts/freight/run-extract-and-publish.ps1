#Requires -Version 5.1
<#
.SYNOPSIS
  Find latest Everde_Freight_Dashboard*.xlsb (or use -DashboardPath / FREIGHT_DASHBOARD_XLSB),
  copy to C:\temp, run extract_data.py, optionally upload dashboard_data.json to Azure Blob.

.DESCRIPTION
  Loads server env from repo .env.local (AZURE_*, FREIGHT_PYTHON, PORTAL_DATA_ROOT, FREIGHT_DASHBOARD_XLSB).

.EXAMPLE
  npm run freight:extract-publish
  .\scripts\freight\run-extract-and-publish.ps1 -DashboardPath "\\server\share\Freight\Everde_Freight_Dashboard_2026-05-11.xlsb"
  .\scripts\freight\run-extract-and-publish.ps1 -SkipPublish
#>
param(
  [string]$DashboardPath = "",
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"

function Import-DotEnvLocal {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

Import-DotEnvLocal $EnvLocal

$python = $env:FREIGHT_PYTHON
if (-not $python) { $python = "python" }

$inputFile = $DashboardPath.Trim()
if (-not $inputFile -and $env:FREIGHT_DASHBOARD_XLSB) {
  $inputFile = $env:FREIGHT_DASHBOARD_XLSB.Trim()
}

if (-not $inputFile) {
  $freightShare = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight"
  if ($env:PORTAL_DATA_ROOT) {
    $root = ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
    $freightShare = Join-Path $root "Freight"
  }
  $candidates = @(
    Get-ChildItem -LiteralPath $freightShare -Filter "Everde_Freight_Dashboard*.xlsb" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  )
  if ($candidates.Count -eq 0) {
    Write-Host "No Everde_Freight_Dashboard*.xlsb found under: $freightShare" -ForegroundColor Red
    Write-Host "Set FREIGHT_DASHBOARD_XLSB in .env.local to the full path, or pass -DashboardPath." -ForegroundColor Yellow
    exit 1
  }
  $inputFile = $candidates[0].FullName
}

Write-Host "Dashboard workbook: $inputFile" -ForegroundColor Cyan

$tempDir = "C:\temp"
if (-not (Test-Path -LiteralPath $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$localCopy = Join-Path $tempDir "freight_dashboard_for_extract.xlsb"
Write-Host "Copying to $localCopy …" -ForegroundColor Cyan
Copy-Item -LiteralPath $inputFile -Destination $localCopy -Force

$outJson = Join-Path $tempDir "dashboard_data.json"
$handoff = Join-Path $PSScriptRoot "claude-handoff"
Push-Location $handoff
try {
  Write-Host "Running extract_data.py …" -ForegroundColor Cyan
  & $python -u extract_data.py $localCopy $outJson
  if ($LASTEXITCODE -ne 0) {
    Write-Error "extract_data.py exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

Write-Host "JSON: $outJson" -ForegroundColor Green

if ($SkipPublish) {
  Write-Host "Skipping Blob upload (-SkipPublish)." -ForegroundColor Yellow
  exit 0
}

if (-not $env:AZURE_STORAGE_CONNECTION_STRING) {
  Write-Warning "AZURE_STORAGE_CONNECTION_STRING missing in .env.local — skip Blob upload. Add it, then run: npm run publish:freight-json -- $outJson"
  exit 0
}

Push-Location $RepoRoot
try {
  Write-Host "Publishing to Azure Blob …" -ForegroundColor Cyan
  & node scripts/freight/publish-dashboard-data.mjs $outJson
} finally {
  Pop-Location
}

Write-Host "Done. Reload Admin → Test fetch or GET /api/freight/dashboard-data" -ForegroundColor Green
