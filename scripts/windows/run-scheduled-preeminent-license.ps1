#Requires -Version 5.1
<#
.SYNOPSIS
  Monthly (1st ~8:30 AM): check previous month's Preeminent PayPal/upload proof.
  If that month ended with no receipt → disable portal + Teams (when PREEMINENT_LICENSE_ENFORCE=1).
#>
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("preeminent-license-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $py = if ($env:FREIGHT_PYTHON) { $env:FREIGHT_PYTHON } else { "python" }
  $script = Join-Path $RepoRoot "scripts\license\check_preeminent_payment.py"
  if (-not (Test-Path -LiteralPath $script)) { throw "Missing $script" }

  Write-Host "Preeminent monthly license gate (previous month)..." -ForegroundColor Cyan
  & $py $script --monthly-gate
  if ($LASTEXITCODE -ne 0) { throw "check_preeminent_payment.py exited $LASTEXITCODE" }
  Write-Host "License check complete." -ForegroundColor Green
} finally {
  Stop-Transcript | Out-Null
}
