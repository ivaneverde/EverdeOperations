#Requires -Version 5.1
<#
.SYNOPSIS
  Daily 4:00 AM: fetch Oracle XXTT Sales Inventory .xls from Gmail into DataDrops
  and forward that inventory file only to XXTT_FORWARD_TO (Jonathan).

.DESCRIPTION
  Runs scripts/nursery/fetch_xxtt_from_gmail.py. Only XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls
  is saved and emailed — no other attachments. The 9:00 AM nursery supply job still
  refreshes the portal/Blob; that run disables forwarding so Jonathan is not emailed twice.
#>
param(
  [switch]$ForceForwardExisting
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("nursery-supply-gmail-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $py = if ($env:NURSERY_PYTHON) { $env:NURSERY_PYTHON } elseif ($env:FREIGHT_PYTHON) { $env:FREIGHT_PYTHON } else { "python" }
  $fetchScript = Join-Path $RepoRoot "scripts\nursery\fetch_xxtt_from_gmail.py"
  if (-not (Test-Path -LiteralPath $fetchScript)) {
    throw "Missing $fetchScript"
  }

  # Ensure forward is on for this dedicated job (9 AM nursery supply turns it off).
  if (-not $env:XXTT_FORWARD_ENABLE) { $env:XXTT_FORWARD_ENABLE = "1" }
  if (-not $env:XXTT_FORWARD_TO) { $env:XXTT_FORWARD_TO = "jsaperstein@everde.com" }

  Write-Host "4:00 AM XXTT Gmail fetch + inventory forward..." -ForegroundColor Cyan
  if ($ForceForwardExisting) {
    & $py $fetchScript --forward-existing
  } else {
    & $py $fetchScript
  }
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    Write-Host "Gmail fetch/forward complete." -ForegroundColor Green
  } elseif ($code -eq 2) {
    Write-Warning "Gmail credentials missing — cannot fetch/forward."
  } elseif ($code -eq 3) {
    Write-Host "No new matching XXTT inventory mail in lookback window." -ForegroundColor Cyan
  } elseif ($code -ne 0) {
    throw "fetch_xxtt_from_gmail.py exited $code"
  }
} finally {
  Stop-Transcript | Out-Null
}
