#Requires -Version 5.1
<#
.SYNOPSIS
  Daily check (default 9:30 AM local): refresh weather from share scripts and publish to Azure Blob.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("weather-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $prev = Get-PipelineState $RepoRoot "weather"

  if (-not $Force -and $prev -and $prev.lastRunDate -eq $today) {
    Write-Host "Weather already ran successfully today ($today)." -ForegroundColor Cyan
    exit 0
  }

  $wxRoot = $env:WEATHER_DATA_ROOT
  if (-not $wxRoot) {
    $wxRoot = "\\192.168.190.10\Claude Sandbox\JS Files\Weather Data"
  }
  $wxRoot = ($wxRoot.Trim() -replace "/", "\").TrimEnd("\")

  if (-not (Test-Path -LiteralPath $wxRoot)) {
    Write-Host "Weather Data not reachable (VPN off?): $wxRoot" -ForegroundColor Yellow
    exit 0
  }

  Write-Host "Running weather share pipeline..." -ForegroundColor Green
  $pipe = Join-Path $RepoRoot "scripts\weather\run-share-pipeline.ps1"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pipe
  if ($LASTEXITCODE -ne 0) { throw "run-share-pipeline failed with exit $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "weather" @{
    lastRunDate = $today
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
    wxRoot      = $wxRoot
  }
  Write-Host "Weather publish complete." -ForegroundColor Green
} finally {
  Stop-Transcript | Out-Null
}
