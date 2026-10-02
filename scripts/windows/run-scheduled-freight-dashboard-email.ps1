#Requires -Version 5.1
<#
.SYNOPSIS
  Monday 9:00 AM: build Jonathan's Freight Dashboard from today's Juanita YTD xlsb
  and email Ivan only (test). Subject: Freight Dashboard.

.DESCRIPTION
  Waits up to -WaitMinutes for a Juanita YTD xlsb written TODAY (no last-week resend).
  Sets FREIGHT_SHIP_CAP to last Friday. Runs the 30-step handoff kit with
  --skip-fuel-check. Source-integrity STOP fails the job with no email.
  This PC must be logged in (Outlook + Excel COM).

  Catch-up: daily Monday 12:00 / 2:30 freight jobs call this with -WaitMinutes 0
  after a late Fila dump is converted.
#>
param(
  [switch]$Force,
  [int]$WaitMinutes = 50
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("freight-dashboard-email-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

function Get-LastFriday {
  $d = (Get-Date).Date
  while ($d.DayOfWeek -ne [DayOfWeek]::Friday) {
    $d = $d.AddDays(-1)
  }
  return $d
}

function Get-NewestTodayYtd([string]$dir) {
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { return $null }
  return Get-ChildItem -LiteralPath $dir -Filter "Everde Freight Data YTD*.xlsb" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "~$*" -and $_.LastWriteTime.Date -eq (Get-Date).Date } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

$lockPath = $null
try {
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $to = if ($env:FREIGHT_DASHBOARD_EMAIL_TO) { $env:FREIGHT_DASHBOARD_EMAIL_TO.Trim() } else { "isunderland@everde.com" }
  if ($to -match "jsaperstein@everde.com") {
    throw "Refusing to email Jonathan. Ivan-only until the team list is opened."
  }

  $kit = if ($env:FREIGHT_HANDOFF_KIT) {
    ($env:FREIGHT_HANDOFF_KIT.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    "C:\Users\isunderland\FreightHandoff"
  }
  if (-not (Test-Path -LiteralPath $kit)) {
    throw "Handoff kit not found: $kit (set FREIGHT_HANDOFF_KIT in .env.local)"
  }

  $juanita = if ($env:FREIGHT_SOURCE_DROP) {
    ($env:FREIGHT_SOURCE_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    "\\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\Freight Load Board Reports\Load Board Reports\2026"
  }
  $dataRoot = Get-DataDropsRoot
  $weeklyDrop = if ($env:FREIGHT_WEEKLY_DROP) {
    ($env:FREIGHT_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    Join-Path $dataRoot "Freight\WeeklyDrop"
  }

  $prev = Get-PipelineState $RepoRoot "freight-dashboard-email"
  if (-not $Force -and $prev -and $prev.sentDate -eq $today) {
    Write-Host "Already emailed Freight Dashboard today ($($prev.workbook)). Skipping." -ForegroundColor Cyan
    exit 0
  }

  $stateDir = Get-SchedulerStateDir $RepoRoot
  $lockPath = Join-Path $stateDir "freight-dashboard-email.lock"
  if (Test-Path -LiteralPath $lockPath) {
    $lockPid = 0
    try { $lockPid = [int]((Get-Content -LiteralPath $lockPath -TotalCount 1).Trim()) } catch { $lockPid = 0 }
    $alive = $false
    if ($lockPid -gt 0) {
      $alive = $null -ne (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)
    }
    if ($alive) {
      Write-Host "Dashboard email job already running (PID $lockPid). Skipping." -ForegroundColor Yellow
      exit 0
    }
  }
  Set-Content -LiteralPath $lockPath -Value "$PID`n$today" -Encoding ASCII

  $deadline = (Get-Date).AddMinutes([Math]::Max(0, $WaitMinutes))
  $src = $null
  do {
    $src = Get-NewestTodayYtd $juanita
    if (-not $src) { $src = Get-NewestTodayYtd $weeklyDrop }
    if ($src) { break }
    if ((Get-Date) -ge $deadline) { break }
    Write-Host "Waiting for today's Juanita YTD xlsb (until $($deadline.ToString('HH:mm')))..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
  } while ((Get-Date) -lt $deadline)

  if (-not $src) {
    Write-Host "No Juanita YTD xlsb written today. Skipping (will not resend last week)." -ForegroundColor Yellow
    exit 0
  }
  Write-Host "Today's YTD source: $($src.FullName)" -ForegroundColor Green

  $archData = Join-Path $kit "archive\data"
  $archDash = Join-Path $kit "archive\dashboards"
  foreach ($d in @($archData, $archDash)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  }

  Get-ChildItem -LiteralPath $kit -Filter "Everde Freight Data YTD*.xlsb" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $src.FullName } |
    ForEach-Object {
      Write-Host "Archiving prior YTD: $($_.Name)" -ForegroundColor Cyan
      Move-Item -LiteralPath $_.FullName -Destination (Join-Path $archData $_.Name) -Force
    }
  Get-ChildItem -LiteralPath $kit -Filter "Everde_Freight_Dashboard_*.xlsx" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Host "Archiving prior dashboard: $($_.Name)" -ForegroundColor Cyan
      Move-Item -LiteralPath $_.FullName -Destination (Join-Path $archDash $_.Name) -Force
    }

  $kitSrc = Join-Path $kit $src.Name
  if ($src.FullName -ne $kitSrc) {
    Copy-Item -LiteralPath $src.FullName -Destination $kitSrc -Force
  }

  $cap = (Get-LastFriday).ToString("yyyy-MM-dd")
  $env:FREIGHT_SHIP_CAP = $cap
  Write-Host "FREIGHT_SHIP_CAP=$cap (last Friday)" -ForegroundColor Cyan

  $python = if ($env:FREIGHT_PYTHON) { $env:FREIGHT_PYTHON } else { "python" }
  if (-not $env:PYTHONUTF8) { $env:PYTHONUTF8 = "1" }
  if (-not $env:PYTHONIOENCODING) { $env:PYTHONIOENCODING = "utf-8" }

  $update = Join-Path $kit "_pipeline\update.py"
  Write-Host "Running 30-step handoff kit..." -ForegroundColor Cyan
  Push-Location $kit
  try {
    & $python $update --skip-fuel-check
    if ($LASTEXITCODE -ne 0) {
      $stop = Join-Path $kit "_pipeline\_quality_log\source_integrity_STOP.txt"
      if (Test-Path -LiteralPath $stop) {
        Write-Warning "Source-integrity gate STOPPED the pipeline. Not emailing."
        Get-Content -LiteralPath $stop | Select-Object -First 40
      }
      throw "update.py exited $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $workbook = Join-Path $kit ("Everde_Freight_Dashboard_{0}.xlsx" -f $today)
  if (-not (Test-Path -LiteralPath $workbook)) {
    $workbook = Get-ChildItem -LiteralPath $kit -Filter "Everde_Freight_Dashboard_*.xlsx" -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 |
      ForEach-Object { $_.FullName }
  }
  if (-not $workbook -or -not (Test-Path -LiteralPath $workbook)) {
    throw "Published dashboard not found under $kit"
  }

  if (Test-Path -LiteralPath $weeklyDrop) {
    Copy-Item -LiteralPath $workbook -Destination (Join-Path $weeklyDrop (Split-Path $workbook -Leaf)) -Force
    Write-Host "Copied dashboard to WeeklyDrop." -ForegroundColor Cyan
  }

  $compose = Join-Path $RepoRoot "scripts\freight\compose_dashboard_email.py"
  $bodyPath = Join-Path $kit "_pipeline\_work\dashboard_email_body.html"
  & $python $compose $kit $bodyPath
  if ($LASTEXITCODE -ne 0) { throw "compose_dashboard_email.py exited $LASTEXITCODE" }

  $send = Join-Path $RepoRoot "scripts\freight\send-dashboard-email.ps1"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $send `
    -Workbook $workbook `
    -To $to `
    -Subject "Freight Dashboard" `
    -BodyFile $bodyPath
  if ($LASTEXITCODE -ne 0) { throw "send-dashboard-email.ps1 exited $LASTEXITCODE" }

  Set-PipelineState $RepoRoot "freight-dashboard-email" @{
    sentDate    = $today
    workbook    = $workbook
    source      = $src.FullName
    shipCap     = $cap
    to          = $to
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Host "Freight Dashboard emailed to $to (subject Freight Dashboard)." -ForegroundColor Green
} finally {
  if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
  Stop-Transcript | Out-Null
}
