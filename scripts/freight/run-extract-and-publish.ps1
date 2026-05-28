#Requires -Version 5.1
<#
.SYNOPSIS
  Find latest dashboard workbook on the Freight share (or use -DashboardPath / FREIGHT_DASHBOARD_XLSB),
  copy to C:\temp, run extract_data.py, optionally upload dashboard_data.json to Azure Blob.

.DESCRIPTION
  Loads server env from repo .env.local (AZURE_*, FREIGHT_PYTHON, PORTAL_DATA_ROOT, FREIGHT_DASHBOARD_XLSB).

  Auto-pick: newest dashboard workbook in Freight\WeeklyDrop only (after update.py or manual copy).
  Patterns: Everde Freight Dashboard*.xlsx, Everde_Freight_Dashboard*.xlsb, Everde Freight Dashboard*.xlsb.
  Raw Everde Freight Data*.xlsb belong in WeeklyDrop for update.py — not used by extract_data.py.

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
  $dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
  if ($env:PORTAL_DATA_ROOT) {
    $dataRoot = ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
  }
  $freightShare = Join-Path $dataRoot "Freight"
  if ($env:FREIGHT_WEEKLY_DROP) {
    $weeklyDrop = ($env:FREIGHT_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    $weeklyDrop = Join-Path $freightShare "WeeklyDrop"
  }
  $patterns = @(
    "Everde Freight Dashboard*.xlsx",
    "Everde_Freight_Dashboard*.xlsb",
    "Everde Freight Dashboard*.xlsb"
  )
  function Get-NewestFreightDashboard {
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return @() }
    $merged = @()
    foreach ($pattern in $patterns) {
      $merged += Get-ChildItem -LiteralPath $Dir -Filter $pattern -File -ErrorAction SilentlyContinue
    }
    return $merged | Sort-Object LastWriteTime -Descending
  }
  $candidates = @(Get-NewestFreightDashboard $weeklyDrop)
  if ($candidates.Count -eq 0) {
    Write-Host "No dashboard workbook in WeeklyDrop:" -ForegroundColor Red
    Write-Host "  $weeklyDrop" -ForegroundColor Red
    Write-Host "Expected ""Everde Freight Dashboard*.xlsx"" (rebuilt output from update.py)." -ForegroundColor Red
    $rawInDrop = @()
    if (Test-Path -LiteralPath $weeklyDrop) {
      $rawInDrop = Get-ChildItem -LiteralPath $weeklyDrop -Filter "Everde Freight Data*.xlsb" -File -ErrorAction SilentlyContinue
    }
    if ($rawInDrop.Count -gt 0) {
      Write-Host ""
      Write-Host "WeeklyDrop has raw .xlsb (correct). Run the pipeline first:" -ForegroundColor Yellow
      Write-Host "  npm run freight:patch-weeklydrop   # once, patches share update.py" -ForegroundColor Yellow
      Write-Host "  npm run freight:update-weekly        # runs update.py from WeeklyDrop" -ForegroundColor Yellow
      Write-Host "  npm run freight:extract-publish      # then publish JSON to Blob" -ForegroundColor Yellow
    }
    Write-Host "Override: FREIGHT_DASHBOARD_XLSB or -DashboardPath" -ForegroundColor Yellow
    exit 1
  }
  $inputFile = $candidates[0].FullName
  Write-Host "Using newest dashboard from WeeklyDrop." -ForegroundColor Cyan
}

Write-Host "Dashboard workbook: $inputFile" -ForegroundColor Cyan

$tempDir = "C:\temp"
if (-not (Test-Path -LiteralPath $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$ext = [System.IO.Path]::GetExtension($inputFile)
if (-not $ext) { $ext = ".xlsb" }
$localCopy = Join-Path $tempDir ("freight_dashboard_for_extract" + $ext)
Write-Host "Copying to ${localCopy}..." -ForegroundColor Cyan
Copy-Item -LiteralPath $inputFile -Destination $localCopy -Force

$outJson = Join-Path $tempDir "dashboard_data.json"
$handoff = Join-Path $PSScriptRoot "claude-handoff"
Push-Location $handoff
try {
  Write-Host "Running extract_data.py..." -ForegroundColor Cyan
  & $python -u extract_data.py $localCopy $outJson $inputFile
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
  Write-Warning "AZURE_STORAGE_CONNECTION_STRING missing in .env.local - skip Blob upload. Add it, then run: npm run publish:freight-json -- $outJson"
  exit 0
}

Push-Location $RepoRoot
try {
  Write-Host "Publishing to Azure Blob..." -ForegroundColor Cyan
  & node scripts/freight/publish-dashboard-data.mjs $outJson
} finally {
  Pop-Location
}

Write-Host "Done. Reload Admin - Test fetch or GET /api/freight/dashboard-data" -ForegroundColor Green
