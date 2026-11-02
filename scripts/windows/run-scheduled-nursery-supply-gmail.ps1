#Requires -Version 5.1
<#
.SYNOPSIS
  Daily 4:00 AM: fetch Oracle XXTT Sales Inventory .xls from Gmail into DataDrops.
  Optional email forward is controlled by XXTT_FORWARD_ENABLE in .env.local (default off).

.DESCRIPTION
  Runs scripts/nursery/fetch_xxtt_from_gmail.py into DataDrops for the 9:00 AM supply refresh.
  Do NOT email XXTT / sales inventory to Jonathan — he wants Splash Full Inventory only
  (Splash schedule "Full Inventory Daily" ~4:00 AM). Set XXTT_FORWARD_ENABLE=1 only if
  someone explicitly wants the sales-inventory .xls forwarded again.
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

  # Honor .env.local. Unset → do not forward (Jonathan gets Splash Full Inventory only).
  if ([string]::IsNullOrWhiteSpace($env:XXTT_FORWARD_ENABLE)) { $env:XXTT_FORWARD_ENABLE = "0" }

  $forwardOn = $env:XXTT_FORWARD_ENABLE -notin @("0", "false", "False")
  Write-Host ("4:00 AM XXTT Gmail fetch" + $(if ($forwardOn) { " + inventory forward..." } else { " (email forward OFF)..." })) -ForegroundColor Cyan
  if ($ForceForwardExisting) {
    if (-not $forwardOn) {
      Write-Warning "XXTT_FORWARD_ENABLE is off — --forward-existing will not email."
    }
    & $py $fetchScript --forward-existing
  } else {
    & $py $fetchScript
  }
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    Write-Host "Gmail fetch complete." -ForegroundColor Green
  } elseif ($code -eq 2) {
    Write-Warning "Gmail credentials missing — cannot fetch."
  } elseif ($code -eq 3) {
    Write-Host "No new matching XXTT inventory mail in lookback window." -ForegroundColor Cyan
  } elseif ($code -ne 0) {
    throw "fetch_xxtt_from_gmail.py exited $code"
  }
} finally {
  Stop-Transcript | Out-Null
}
