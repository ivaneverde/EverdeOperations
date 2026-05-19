#Requires -Version 5.1
<#
.SYNOPSIS
  Build the five West Coast retail output workbooks from weekly source feeds on the share.

.DESCRIPTION
  Runs build_retail_workbooks.py (Lowe's SKU xref fix included).
  Writes to DataDrops\SalesOpportunity by default.

  Source discovery (auto): HD week file, Lowe's YTD by store, Inventory Transform,
  2026 Sales by Item, 2026 Sales Plan by Item, HD/Lowe's xrefs under JS Files\Shared\...

.EXAMPLE
  npm run retail:build-workbooks
  .\scripts\retail-opportunity\run-build-workbooks.ps1 -Week 14 -Year 2026
#>
param(
  [int]$Week = 0,
  [int]$Year = 0,
  [string]$OutFolder = "",
  [switch]$SkipIfSourcesMissing
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
$ScriptDir = $PSScriptRoot

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

$python = $env:RETAIL_PYTHON
if (-not $python) { $python = $env:SALES_PLAN_PYTHON }
if (-not $python) { $python = $env:FREIGHT_PYTHON }
if (-not $python) { $python = "python" }

$dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
if ($env:PORTAL_DATA_ROOT) {
  $dataRoot = ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
}

$out = $OutFolder.Trim()
if (-not $out) {
  if ($env:RETAIL_WEEKLY_DROP) {
    $out = ($env:RETAIL_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    $out = Join-Path $dataRoot "SalesOpportunity"
  }
}

if ($Week -le 0 -or $Year -le 0) {
  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  $cal = $culture.Calendar
  $weekRule = [System.Globalization.CalendarWeekRule]::FirstFourDayWeek
  $firstDay = [System.DayOfWeek]::Monday
  if ($Week -le 0) {
    $Week = $cal.GetWeekOfYear((Get-Date), $weekRule, $firstDay)
  }
  if ($Year -le 0) {
    $Year = (Get-Date).Year
  }
}

$build = Join-Path $ScriptDir "build_retail_workbooks.py"
$args = @($build, "--week", $Week, "--year", $Year, "--out", $out)

Write-Host "Retail build: Wk$Week $Year -> $out" -ForegroundColor Cyan
& $python @args
if ($LASTEXITCODE -ne 0) {
  if ($SkipIfSourcesMissing) {
    Write-Host "Build skipped/failed (exit $LASTEXITCODE); sources may be missing." -ForegroundColor Yellow
    exit 0
  }
  throw "build_retail_workbooks.py failed with exit $LASTEXITCODE"
}
Write-Host "Five workbooks written to $out" -ForegroundColor Green
