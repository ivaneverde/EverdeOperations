#Requires -Version 5.1
<#
.SYNOPSIS
  Weekly check: process SalesOpportunity drop if the five workbooks changed.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("retail-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $drop = if ($env:RETAIL_WEEKLY_DROP) {
    ($env:RETAIL_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    Join-Path $dataRoot "SalesOpportunity"
  }

  if (-not (Test-Path -LiteralPath $drop)) {
    Write-Host "SalesOpportunity not reachable: $drop" -ForegroundColor Yellow
    exit 0
  }

  function Newest([string[]]$patterns) {
    $all = @()
    foreach ($p in $patterns) {
      $all += Get-ChildItem -LiteralPath $drop -Filter $p -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "Archive|~\$" }
    }
    if ($all.Count -eq 0) { return $null }
    return $all | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

  $sms = Newest @("Sales Manager Summary*.xlsx")
  $hd = Newest @("HD Sales Variance*.xlsx")
  $low = Newest @("LOW Sales Variance*.xlsx")
  $miss = Newest @("*Item*Miss*.xlsx", "Wk* Item-Level Miss*.xlsx")
  $forMiss = Newest @("FOR Source Miss*.xlsx")

  if (-not $sms -or -not $hd -or -not $low -or -not $miss -or -not $forMiss) {
    Write-Host "Waiting for all five files in $drop" -ForegroundColor Yellow
    exit 0
  }

  $fp = @{
    sms  = (Get-FileFingerprint $sms)
    hd   = (Get-FileFingerprint $hd)
    low  = (Get-FileFingerprint $low)
    miss = (Get-FileFingerprint $miss)
    fore = (Get-FileFingerprint $forMiss)
  }

  $prev = Get-PipelineState $RepoRoot "retail-opportunity"
  $changed = $Force -or
    (Test-FingerprintChanged $prev.sms $fp.sms) -or
    (Test-FingerprintChanged $prev.hd $fp.hd) -or
    (Test-FingerprintChanged $prev.low $fp.low) -or
    (Test-FingerprintChanged $prev.miss $fp.miss) -or
    (Test-FingerprintChanged $prev.fore $fp.fore)

  if (-not $changed) {
    Write-Host "No new retail files since last run." -ForegroundColor Cyan
    exit 0
  }

  Write-Host "Retail workbooks changed. Running extract + Blob publish..." -ForegroundColor Green
  Push-Location $RepoRoot
  & npm run retail:extract-publish
  if ($LASTEXITCODE -ne 0) { throw "retail:extract-publish failed with exit $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "retail-opportunity" @{
    sms         = $fp.sms
    hd          = $fp.hd
    low         = $fp.low
    miss        = $fp.miss
    fore        = $fp.fore
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Host "Retail publish complete." -ForegroundColor Green
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
