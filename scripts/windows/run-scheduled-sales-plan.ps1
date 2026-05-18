#Requires -Version 5.1
<#
.SYNOPSIS
  Daily check (default 8:00 AM local): process Sales Plan WeeklyDrop if files are new.
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

  function Newest([string[]]$patterns) {
    $all = @()
    foreach ($p in $patterns) {
      $all += Get-ChildItem -LiteralPath $weeklyDrop -Filter $p -File -ErrorAction SilentlyContinue
    }
    if ($all.Count -eq 0) { return $null }
    return $all | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

  $inv = Newest @("Inventory Transform*.xlsx", "Inventory_Transform*.xlsx", "*Inventory*Transform*.xlsx")
  $ytd = Newest @("2026 Sales by Item*.xlsx", "*Sales by Item*.xlsx", "*Sales_by_Item*.xlsx")

  if (-not $inv -or -not $ytd) {
    Write-Host "Waiting for both files in $weeklyDrop" -ForegroundColor Yellow
    exit 0
  }

  $fp = @{
    inv  = (Get-FileFingerprint $inv)
    ytd  = (Get-FileFingerprint $ytd)
  }

  $prev = Get-PipelineState $RepoRoot "sales-plan"

  $changed = $Force -or
    (Test-FingerprintChanged $prev.inv $fp.inv) -or
    (Test-FingerprintChanged $prev.ytd $fp.ytd)

  if (-not $changed) {
    Write-Host "No new Sales Plan files since last run." -ForegroundColor Cyan
    exit 0
  }

  Write-Host "New Sales Plan drop detected. Running extract + Blob publish..." -ForegroundColor Green
  Push-Location $RepoRoot
  & npm run sales-plan:extract-publish
  if ($LASTEXITCODE -ne 0) { throw "sales-plan:extract-publish failed with exit $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "sales-plan" @{
    inv         = $fp.inv
    ytd         = $fp.ytd
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Host "Sales Plan publish complete." -ForegroundColor Green
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
