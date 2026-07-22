#Requires -Version 5.1
<#
.SYNOPSIS
  Daily check (default 8:00 AM local): process Sales Plan WeeklyDrop if files are new.
  Also watches for newest HD Sales YTD with Following Week Sales*.xlsx and extract-publishes
  to Blob only when that file fingerprint changes (independent of INV / Sales-by-Item).
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("sales-plan-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $weeklyDrop = if ($env:SALES_PLAN_WEEKLY_DROP) {
    ($env:SALES_PLAN_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"
  }

  if (-not (Test-Path -LiteralPath $weeklyDrop)) {
    Write-Host "WeeklyDrop not reachable: $weeklyDrop" -ForegroundColor Yellow
    exit 0
  }

  $syncScript = Join-Path $RepoRoot "scripts\sales-plan-review\sync-sales-by-item-from-admin.ps1"
  if (Test-Path -LiteralPath $syncScript) {
    Write-Host "Syncing admin Sales by Item to WeeklyDrop (if newer)..." -ForegroundColor Cyan
    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript
  }

  function Newest([string[]]$patterns) {
    $all = @()
    foreach ($p in $patterns) {
      $all += Get-ChildItem -LiteralPath $weeklyDrop -Filter $p -File -ErrorAction SilentlyContinue
    }
    if ($all.Count -eq 0) { return $null }
    return $all | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

  Push-Location $RepoRoot

  # --- NOR CAL Sales Plan (INV + Sales by Item) ---
  $inv = Newest @("Inventory Transform*.xlsx", "Inventory_Transform*.xlsx", "*Inventory*Transform*.xlsx")
  $ytd = Newest @("2026 Sales by Item*.xlsx", "*Sales by Item*.xlsx", "*Sales_by_Item*.xlsx")

  if (-not $inv -or -not $ytd) {
    Write-Host "Sales Plan INV/YTD: waiting for both files in $weeklyDrop" -ForegroundColor Yellow
  } else {
    $fp = @{
      inv  = (Get-FileFingerprint $inv)
      ytd  = (Get-FileFingerprint $ytd)
    }
    $prev = Get-PipelineState $RepoRoot "sales-plan"
    $changed = $Force -or
      (Test-WeeklyDropNeedsProcessing $inv $prev.inv $prev) -or
      (Test-WeeklyDropNeedsProcessing $ytd $prev.ytd $prev)

    if (-not $changed) {
      Write-Host "No new Sales Plan INV/YTD files since last run." -ForegroundColor Cyan
    } else {
      Write-Host "New Sales Plan drop detected. Running extract + Blob publish..." -ForegroundColor Green
      & npm run sales-plan:extract-publish
      if ($LASTEXITCODE -ne 0) { throw "sales-plan:extract-publish failed with exit $LASTEXITCODE" }
      Set-PipelineState $RepoRoot "sales-plan" @{
        inv         = $fp.inv
        ytd         = $fp.ytd
        processedAt = (Get-Date).ToUniversalTime().ToString("o")
      }
      Write-Host "Sales Plan publish complete." -ForegroundColor Green
    }
  }

  # --- HD Sales YTD Following Week (independent fingerprint) ---
  $hd = Newest @(
    "HD Sales YTD with Following Week Sales*.xlsx",
    "HD Sales YTD*.xlsx"
  )
  if (-not $hd) {
    Write-Host "HD YTD: no matching workbook in WeeklyDrop yet." -ForegroundColor Yellow
  } else {
    $hdFp = Get-FileFingerprint $hd
    $hdPrev = Get-PipelineState $RepoRoot "hd-ytd"
    $hdChanged = $Force -or (Test-WeeklyDropNeedsProcessing $hd $hdPrev.file $hdPrev)
    if (-not $hdChanged) {
      Write-Host "HD YTD: $($hd.Name) unchanged since last publish." -ForegroundColor Cyan
    } else {
      Write-Host "HD YTD: new file $($hd.Name). Extract + Blob publish..." -ForegroundColor Green
      & npm run sales-plan:hd-ytd-extract-publish
      if ($LASTEXITCODE -ne 0) { throw "sales-plan:hd-ytd-extract-publish failed with exit $LASTEXITCODE" }
      Set-PipelineState $RepoRoot "hd-ytd" @{
        file        = $hdFp
        processedAt = (Get-Date).ToUniversalTime().ToString("o")
      }
      Write-Host "HD YTD publish complete." -ForegroundColor Green
    }
  }

  # --- Lowe's YTD BY STORE SKU (independent fingerprint; same WeeklyDrop) ---
  $lowes = Newest @(
    "YTD BY STORE SKU*.xlsb",
    "YTD BY STORE SKU*.xlsx",
    "Lowes YTD*.xlsb",
    "LOW YTD BY STORE SKU*.xlsb",
    "LOWES YTD*.xlsb"
  )
  if (-not $lowes) {
    Write-Host "Lowes YTD: no matching workbook in WeeklyDrop yet." -ForegroundColor Yellow
  } else {
    $lowesFp = Get-FileFingerprint $lowes
    $lowesPrev = Get-PipelineState $RepoRoot "lowes-ytd"
    $lowesChanged = $Force -or (Test-WeeklyDropNeedsProcessing $lowes $lowesPrev.file $lowesPrev)
    if (-not $lowesChanged) {
      Write-Host "Lowes YTD: $($lowes.Name) unchanged since last publish." -ForegroundColor Cyan
    } else {
      Write-Host "Lowes YTD: new file $($lowes.Name). Extract + Blob publish..." -ForegroundColor Green
      & npm run sales-plan:lowes-ytd-extract-publish
      if ($LASTEXITCODE -ne 0) { throw "sales-plan:lowes-ytd-extract-publish failed with exit $LASTEXITCODE" }
      Set-PipelineState $RepoRoot "lowes-ytd" @{
        file        = $lowesFp
        processedAt = (Get-Date).ToUniversalTime().ToString("o")
      }
      Write-Host "Lowes YTD publish complete." -ForegroundColor Green
    }
  }
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
