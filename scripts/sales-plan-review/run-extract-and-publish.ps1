#Requires -Version 5.1
<#
.SYNOPSIS
  Pick newest weekly files from Sales Plan Review\WeeklyDrop, run extract_sales_plan.py, publish JSON to Azure Blob.

.DESCRIPTION
  Loads .env.local from repo root (AZURE_*, SALES_PLAN_PYTHON, PORTAL_DATA_ROOT).

  Weekly drop (default):
    \\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop
  Files: newest *Inventory*Transform*.xlsx and *Sales*by*Item*.xlsx

  Requires nor_cal_forward_patched.py (+ build_norcal_workbook_patched.py) in this folder
  (run sync-share-scripts.ps1 on VPN first).

.EXAMPLE
  npm run sales-plan:extract-publish
  .\scripts\sales-plan-review\run-extract-and-publish.ps1 -SkipPublish
#>
param(
  [string]$WeeklyDropPath = "",
  [string]$InvPath = "",
  [string]$YtdPath = "",
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
$ScriptDir = $PSScriptRoot

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

function Get-NewestMatch {
  param(
    [string]$Directory,
    [string[]]$Patterns
  )
  if (-not (Test-Path -LiteralPath $Directory)) { return $null }
  $merged = @()
  foreach ($pattern in $Patterns) {
    $merged += Get-ChildItem -LiteralPath $Directory -Filter $pattern -File -ErrorAction SilentlyContinue
  }
  if ($merged.Count -eq 0) { return $null }
  return $merged | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

Import-DotEnvLocal $EnvLocal

$python = $env:SALES_PLAN_PYTHON
if (-not $python) { $python = $env:FREIGHT_PYTHON }
if (-not $python) { $python = "python" }

$dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
if ($env:PORTAL_DATA_ROOT) {
  $dataRoot = ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
}
if ($env:SALES_PLAN_WEEKLY_DROP) {
  $weeklyDrop = ($env:SALES_PLAN_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
} elseif ($WeeklyDropPath) {
  $weeklyDrop = ($WeeklyDropPath.Trim() -replace "/", "\").TrimEnd("\")
} else {
  $weeklyDrop = Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"
}

$invFile = $InvPath.Trim()
$ytdFile = $YtdPath.Trim()

if (-not $invFile) {
  $hit = Get-NewestMatch $weeklyDrop @(
    "Inventory Transform*.xlsx",
    "Inventory_Transform*.xlsx",
    "*Inventory*Transform*.xlsx"
  )
  if ($hit) { $invFile = $hit.FullName }
}
if (-not $ytdFile) {
  $hit = Get-NewestMatch $weeklyDrop @(
    "2026 Sales by Item*.xlsx",
    "*Sales by Item*.xlsx",
    "*Sales_by_Item*.xlsx"
  )
  if ($hit) { $ytdFile = $hit.FullName }
}

if (-not $invFile -or -not (Test-Path -LiteralPath $invFile)) {
  Write-Host "No Inventory Transform file found under: $weeklyDrop" -ForegroundColor Red
  Write-Host "Drop the weekly file there or pass -InvPath." -ForegroundColor Yellow
  exit 1
}
if (-not $ytdFile -or -not (Test-Path -LiteralPath $ytdFile)) {
  Write-Host "No Sales by Item file found under: $weeklyDrop" -ForegroundColor Red
  Write-Host "Drop the weekly file there or pass -YtdPath." -ForegroundColor Yellow
  exit 1
}

$forwardScript = Join-Path $ScriptDir "nor_cal_forward_patched.py"
if (-not (Test-Path -LiteralPath $forwardScript)) {
  $forwardScript = Join-Path $ScriptDir "nor_cal_forward.py"
}
if (-not (Test-Path -LiteralPath $forwardScript)) {
  Write-Host "Missing nor_cal_forward_patched.py in $ScriptDir" -ForegroundColor Red
  Write-Host "On VPN run: powershell -File scripts/sales-plan-review/sync-share-scripts.ps1" -ForegroundColor Yellow
  exit 1
}

Write-Host "Weekly drop folder: $weeklyDrop" -ForegroundColor Cyan
Write-Host "Inventory: $invFile" -ForegroundColor Cyan
Write-Host "YTD Sales: $ytdFile" -ForegroundColor Cyan

$tempDir = "C:\temp"
if (-not (Test-Path -LiteralPath $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}
$outJson = Join-Path $tempDir "sales_plan_data.json"
$extract = Join-Path $ScriptDir "extract_sales_plan.py"

Push-Location $ScriptDir
try {
  Write-Host "Running extract_sales_plan.py (may take 2-3 minutes)..." -ForegroundColor Cyan
  & $python -u $extract --inv $invFile --ytd $ytdFile --out $outJson
  if ($LASTEXITCODE -ne 0) {
    Write-Error "extract_sales_plan.py exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $outJson)) {
  Write-Error "Output JSON not created: $outJson"
  exit 1
}

Write-Host "JSON: $outJson ($([math]::Round((Get-Item $outJson).Length / 1KB, 1)) KB)" -ForegroundColor Green

if ($SkipPublish) {
  Write-Host "Skipping Blob upload (-SkipPublish)." -ForegroundColor Yellow
  exit 0
}

if (-not $env:AZURE_STORAGE_CONNECTION_STRING) {
  Write-Warning "AZURE_STORAGE_CONNECTION_STRING missing - skip Blob. Run: npm run publish:sales-plan-json -- $outJson"
  exit 0
}

Push-Location $RepoRoot
try {
  Write-Host "Publishing to Azure Blob (sales-plan/latest/sales_plan_data.json)..." -ForegroundColor Cyan
  & node scripts/sales-plan-review/publish-dashboard-data.mjs $outJson
} finally {
  Pop-Location
}

Write-Host "Done. Portal Sales Plan tabs will use new data after reload." -ForegroundColor Green
