#Requires -Version 5.1
<#
.SYNOPSIS
  Copy the newest admin-posted 2026 Sales by Item file into Sales Plan Review\WeeklyDrop.

.DESCRIPTION
  Admin (Franklin) posts weekly files under Everde Central Share Planning & Reporting.

  Layout (month folders — go OUT one level from the current month to pick the next):
    ...\Sales by Item\Current Year Sales by Items (Posted Weekly)\
      1 Jan\  2 Feb\  ...  11 Nov\  12 Dec\
        2026 Sales by Item MMDDYY.xlsx

  Example: this week's file is under `11 Nov\`; next month open `12 Dec\` (sibling of
  `11 Nov`, not inside it), then the dated workbook. The script -Recurse's that whole
  Posted Weekly tree and copies the newest *.xlsx by LastWriteTime into WeeklyDrop.

  Default source (reachable from agent PC):
    \\VRD-AWSECS\Everde Central Share\Planning & Reporting\Data & Reports\Posted Data\Sales by Item\Current Year Sales by Items (Posted Weekly)
  Override: SALES_BY_ITEM_SOURCE in .env.local


.EXAMPLE
  npm run sales-plan:sync-sales-by-item
#>
param(
  [string]$SourceRoot = "",
  [string]$WeeklyDropDir = "",
  [switch]$WhatIf
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

if (-not $SourceRoot) {
  $SourceRoot = $env:SALES_BY_ITEM_SOURCE
}
if (-not $SourceRoot) {
  $SourceRoot = "\\VRD-AWSECS\Everde Central Share\Planning & Reporting\Data & Reports\Posted Data\Sales by Item\Current Year Sales by Items (Posted Weekly)"
}

$dataRoot = $env:PORTAL_DATA_ROOT
if (-not $dataRoot) {
  $dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
}
$dataRoot = ($dataRoot.Trim() -replace "/", "\").TrimEnd("\")

if (-not $WeeklyDropDir) {
  if ($env:SALES_PLAN_WEEKLY_DROP) {
    $WeeklyDropDir = ($env:SALES_PLAN_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    $WeeklyDropDir = Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"
  }
}

if (-not (Test-Path -LiteralPath $SourceRoot)) {
  Write-Host "Admin Sales by Item source not reachable:" -ForegroundColor Yellow
  Write-Host "  $SourceRoot" -ForegroundColor Yellow
  Write-Host "Set SALES_BY_ITEM_SOURCE in .env.local or copy the file to WeeklyDrop manually." -ForegroundColor Yellow
  exit 0
}

$patterns = @("2026 Sales by Item*.xlsx", "*Sales by Item*.xlsx")
$hits = @()
foreach ($pat in $patterns) {
  $hits += Get-ChildItem -LiteralPath $SourceRoot -Filter $pat -Recurse -File -ErrorAction SilentlyContinue
}
if ($hits.Count -eq 0) {
  Write-Host "No Sales by Item files under: $SourceRoot" -ForegroundColor Yellow
  exit 0
}

$source = $hits | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "Newest admin Sales by Item:" -ForegroundColor Cyan
Write-Host "  $($source.FullName)" -ForegroundColor Cyan
Write-Host "  $($source.LastWriteTime)  $([math]::Round($source.Length / 1MB, 1)) MB" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $WeeklyDropDir)) {
  New-Item -ItemType Directory -Path $WeeklyDropDir -Force | Out-Null
}

$dest = Join-Path $WeeklyDropDir $source.Name
$copy = $true
if (Test-Path -LiteralPath $dest) {
  $existing = Get-Item -LiteralPath $dest
  if ($existing.Length -eq $source.Length -and $existing.LastWriteTimeUtc -eq $source.LastWriteTimeUtc) {
    $copy = $false
    Write-Host "WeeklyDrop already has this file; skip copy." -ForegroundColor Cyan
  }
}

if ($copy) {
  if ($WhatIf) {
    Write-Host "WhatIf: would copy to $dest" -ForegroundColor Yellow
  } else {
    Copy-Item -LiteralPath $source.FullName -Destination $dest -Force
    Write-Host "Copied to WeeklyDrop:" -ForegroundColor Green
    Write-Host "  $dest" -ForegroundColor Green
  }
}
