#Requires -Version 5.1
<#
.SYNOPSIS
  Weekly check (default Monday 9:00 AM local): rebuild freight dashboard if raw WeeklyDrop file is new,
  then publish JSON to Azure Blob when the dashboard workbook changes.
  Runs update.py with --skip-fuel-check so Task Scheduler never blocks on the fuel_data.py [y/N] prompt.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("freight-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $weeklyDrop = if ($env:FREIGHT_WEEKLY_DROP) {
    ($env:FREIGHT_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    Join-Path $dataRoot "Freight\WeeklyDrop"
  }

  if (-not (Test-Path -LiteralPath $weeklyDrop)) {
    Write-Host "Freight WeeklyDrop not reachable: $weeklyDrop" -ForegroundColor Yellow
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

  $raw = Newest @("Everde Freight Data*.xlsb")
  $dash = Newest @(
    "Everde Freight Dashboard*.xlsx",
    "Everde_Freight_Dashboard*.xlsb",
    "Everde Freight Dashboard*.xlsb"
  )

  $prev = Get-PipelineState $RepoRoot "freight"

  $rawFp = Get-FileFingerprint $raw
  $dashFp = Get-FileFingerprint $dash

  $rawNew = $Force -or (Test-FingerprintChanged $prev.raw $rawFp)
  $dashNew = $Force -or (Test-FingerprintChanged $prev.dashboard $dashFp)

  Push-Location $RepoRoot

  if ($rawNew -and $raw) {
    Write-Host "New raw freight file: $($raw.Name). Running update.py pipeline (non-interactive)..." -ForegroundColor Green
    & npm run freight:update-weekly -- -SkipFuelCheck
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "freight:update-weekly exited $LASTEXITCODE (may still publish if dashboard was copied)"
    }
    $dash = Newest @(
      "Everde Freight Dashboard*.xlsx",
      "Everde_Freight_Dashboard*.xlsb",
      "Everde Freight Dashboard*.xlsb"
    )
    $dashFp = Get-FileFingerprint $dash
    $dashNew = $true
  }

  if (-not $dash) {
    Write-Host "No dashboard workbook in WeeklyDrop yet." -ForegroundColor Yellow
    exit 0
  }

  if (-not $dashNew) {
    Write-Host "No new freight dashboard since last publish." -ForegroundColor Cyan
    exit 0
  }

  Write-Host "Publishing freight dashboard: $($dash.Name)" -ForegroundColor Green
  & npm run freight:extract-publish
  if ($LASTEXITCODE -ne 0) { throw "freight:extract-publish failed with exit $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "freight" @{
    raw         = $rawFp
    dashboard   = $dashFp
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Host "Freight Blob publish complete." -ForegroundColor Green
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
