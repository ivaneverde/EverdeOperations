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
  $prev = Get-PipelineState $RepoRoot "weather"
  $dataRoot = Get-DataDropsRoot
  $weatherDrop = Join-Path $dataRoot "Weather\WeeklyDrop"
  $dropFile = $null
  if (Test-Path -LiteralPath $weatherDrop) {
    $dropFile = Get-ChildItem -LiteralPath $weatherDrop -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  $needsRun = $Force
  if (-not $needsRun -and $dropFile) {
    $needsRun = Test-WeeklyDropNeedsProcessing $dropFile $prev.drop $prev
  }
  $processed = Get-ProcessedAtUtc $prev
  if (-not $needsRun -and (-not $processed -or ((Get-Date).ToUniversalTime() - $processed).TotalHours -ge 20)) {
    $needsRun = $true
  }
  if (-not $needsRun) {
    Write-Host "No new Weather WeeklyDrop files since last run." -ForegroundColor Cyan
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

  $sync = Join-Path $RepoRoot "scripts\weather\sync-weeklydrop.ps1"
  if (Test-Path -LiteralPath $sync) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sync
    if ($LASTEXITCODE -ne 0) { Write-Warning "weather sync-weeklydrop exited $LASTEXITCODE" }
  }

  Write-Host "Running weather share pipeline..." -ForegroundColor Green
  $pipe = Join-Path $RepoRoot "scripts\weather\run-share-pipeline.ps1"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pipe
  if ($LASTEXITCODE -ne 0) { throw "run-share-pipeline failed with exit $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "weather" @{
    drop        = if ($dropFile) { Get-FileFingerprint $dropFile } else { $null }
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
    wxRoot      = $wxRoot
  }
  Write-Host "Weather publish complete." -ForegroundColor Green
} finally {
  Stop-Transcript | Out-Null
}
