#Requires -Version 5.1
<#
.SYNOPSIS
  Run Weather Data scripts on the LAN share, refresh portal HTML/JSON, publish to Azure Blob.

.DESCRIPTION
  Scripts live on the share (not in git): JS Files\Weather Data\scripts\
  Default root: \\192.168.190.10\Claude Sandbox\JS Files\Weather Data
  Override: WEATHER_DATA_ROOT in .env.local

  Daily mode (default): fetch → build_sales_state → build_sales_report → build_shared_crosswalk
  (matches Everde-Weather-DailyCheck.xml), then copy HTML + bootstrap JSON + Azure Blob publish.
  Full mode (-FullPipeline): also runs sales overlay + sales×weather reports when HD sales are current.

.EXAMPLE
  npm run weather:share-pipeline
  powershell -File scripts/weather/run-share-pipeline.ps1 -FullPipeline
#>
param(
  [switch]$FullPipeline,
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"

function Import-DotEnvLocal {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
  }
}

Import-DotEnvLocal $EnvLocal

$wxRoot = $env:WEATHER_DATA_ROOT
if (-not $wxRoot) {
  $wxRoot = "\\192.168.190.10\Claude Sandbox\JS Files\Weather Data"
}
$wxRoot = ($wxRoot.Trim() -replace "/", "\").TrimEnd("\")
$scriptsDir = Join-Path $wxRoot "scripts"

$python = $env:WEATHER_PYTHON
if (-not $python) { $python = $env:SALES_PLAN_PYTHON }
if (-not $python) { $python = $env:FREIGHT_PYTHON }
if (-not $python) {
  $pyCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pyCmd) { $python = $pyCmd.Source }
}
if (-not $python) {
  throw "Python not found. Set WEATHER_PYTHON in .env.local or install Python 3.x."
}

function Invoke-WeatherScript {
  param(
    [string]$Name,
    [string[]]$ScriptArgs = @(),
    [switch]$Optional
  )
  $scriptPath = Join-Path $scriptsDir $Name
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Host "Skip (missing): $Name" -ForegroundColor Yellow
    return $false
  }
  Write-Host "Running $Name ..." -ForegroundColor Cyan
  $env:EVERDE_TODAY = (Get-Date).ToString("yyyy-MM-dd")
  & $python $scriptPath @ScriptArgs
  if ($LASTEXITCODE -ne 0) {
    if ($Optional) {
      Write-Host "WARNING: $Name failed (exit $LASTEXITCODE) - continuing." -ForegroundColor Yellow
      return $false
    }
    throw "$Name failed with exit $LASTEXITCODE"
  }
  return $true
}

if (-not (Test-Path -LiteralPath $wxRoot)) {
  throw "Weather Data folder not reachable (VPN?): $wxRoot"
}

if (-not (Test-Path -LiteralPath $scriptsDir)) {
  throw "Weather scripts folder missing: $scriptsDir"
}

Write-Host "Weather root: $wxRoot" -ForegroundColor Gray

# Ensure crosswalk script exists on share (from Claude ToDo package / repo copy)
$repoCrosswalk = Join-Path $PSScriptRoot "build_shared_crosswalk.py"
$shareCrosswalk = Join-Path $scriptsDir "build_shared_crosswalk.py"
if ((Test-Path -LiteralPath $repoCrosswalk) -and -not (Test-Path -LiteralPath $shareCrosswalk)) {
  Copy-Item -LiteralPath $repoCrosswalk -Destination $shareCrosswalk -Force
  Write-Host "Installed build_shared_crosswalk.py on share." -ForegroundColor Green
}

$jsFilesRoot = Split-Path $wxRoot -Parent
$sharedDir = Join-Path $jsFilesRoot "shared"
$logsDir = Join-Path $jsFilesRoot "logs"
foreach ($dir in @($sharedDir, $logsDir)) {
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "Created $dir" -ForegroundColor Gray
  }
}

# Daily pipeline (aligned with Everde-Weather-DailyCheck.xml)
# fetch is required; sales/crosswalk steps are optional when HD/Lowe's drops are not current
Invoke-WeatherScript "fetch_weather_v2.py" | Out-Null
Invoke-WeatherScript "build_sales_state_v2.py" -Optional | Out-Null
Invoke-WeatherScript "build_sales_report_v2.py" -Optional | Out-Null
Invoke-WeatherScript "build_shared_crosswalk.py" -Optional | Out-Null

function Get-IsoWeekNumber([datetime]$d) {
  try {
    return [System.Globalization.ISOWeek]::GetWeekOfYear($d)
  } catch {
    $cal = [System.Globalization.CultureInfo]::InvariantCulture.Calendar
    return $cal.GetWeekOfYear(
      $d,
      [System.Globalization.CalendarWeekRule]::FirstFourDayWeek,
      [DayOfWeek]::Monday
    )
  }
}

if ($FullPipeline) {
  $today = Get-Date
  $isoYear = $today.Year
  $isoWeek = Get-IsoWeekNumber $today
  Invoke-WeatherScript "sales_overlay.py" @("--week", [string]($isoWeek - 1), "--year", [string]$isoYear) | Out-Null
  Invoke-WeatherScript "sales_overlay.py" @("--week", [string]$isoWeek, "--year", [string]$isoYear) | Out-Null
  Invoke-WeatherScript "build_weather_report_v2.py" | Out-Null
  if ($today.DayOfWeek -eq "Monday") {
    Invoke-WeatherScript "hd_vs_lowes_divergence.py" | Out-Null
  }
}

# Copy newest dashboard HTML from share → public/
$publicHtml = Join-Path $RepoRoot "public\Everde_Weather_Dashboard.html"
$htmlCandidates = @()
if (Test-Path -LiteralPath $wxRoot) {
  $htmlCandidates += Get-ChildItem -LiteralPath $wxRoot -Filter "Everde_Weather_Dashboard*.html" -File -ErrorAction SilentlyContinue
}
$scriptsParent = Split-Path $scriptsDir -Parent
if ($scriptsParent -and (Test-Path -LiteralPath $scriptsParent)) {
  $htmlCandidates += Get-ChildItem -LiteralPath $scriptsParent -Filter "Everde_Weather_Dashboard*.html" -File -ErrorAction SilentlyContinue
}

if ($htmlCandidates.Count -gt 0) {
  $newest = $htmlCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Copy-Item -LiteralPath $newest.FullName -Destination $publicHtml -Force
  Write-Host "Copied HTML: $($newest.Name)" -ForegroundColor Green
} else {
  Write-Host "No Everde_Weather_Dashboard*.html on share; keeping existing public HTML." -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $publicHtml)) {
  throw "Missing $publicHtml - copy Everde_Weather_Dashboard.html to public/ or run share pipeline with VPN."
}

Push-Location $RepoRoot
try {
  & node scripts/weather/bootstrap-json-from-html.mjs
  if ($LASTEXITCODE -ne 0) { throw "bootstrap-json-from-html failed" }

  if (-not $SkipPublish) {
    & npm run weather:publish
    if ($LASTEXITCODE -ne 0) { throw "weather:publish failed" }
  }
} finally {
  Pop-Location
}

Write-Host "Weather share pipeline complete." -ForegroundColor Green
