#Requires -Version 5.1
<#
.SYNOPSIS
  Monday 8:00 AM: move Fila's freight_load_board dump off everde_prod and write
  Juanita-format Everde Freight Data YTD .xlsb to Load Board 2026 + WeeklyDrop.

.DESCRIPTION
  Thin logged wrapper around run-load-board-from-archive.ps1.
  Daily 10:00 / 12:00 / 2:30 freight jobs still catch a late dump.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("freight-load-board-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  Write-Host "Monday Load Board convert (Fila everde_prod -> Juanita 2026)..." -ForegroundColor Cyan
  $buildScript = Join-Path $RepoRoot "scripts\freight\run-load-board-from-archive.ps1"
  $cmdArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $buildScript)
  if ($Force) { $cmdArgs += "-Force" }
  & powershell.exe @cmdArgs
  if ($LASTEXITCODE -ne 0) {
    throw "run-load-board-from-archive.ps1 exited $LASTEXITCODE"
  }
  Write-Host "Load Board Monday convert finished." -ForegroundColor Green
} finally {
  Stop-Transcript | Out-Null
}
