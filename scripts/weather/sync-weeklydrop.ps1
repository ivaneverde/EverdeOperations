#Requires -Version 5.1
<#
.SYNOPSIS
  Sync daily HD/Lowe's sales files into Weather Data\Sales Data for the weather pipeline.

.DESCRIPTION
  Copies the newest matching files from (in order):
    1. DataDrops\Weather\WeeklyDrop  (if daily files are dropped there)
    2. JS Files 2\Weather            (Jonathan's daily email drops)
  into JS Files\Weather Data\Sales Data\ (canonical input for build_sales_state_v2.py).

  Weekly retail files (HD week, Lowe's YTD SKU) in WeeklyDrop are left in place;
  retail build reads that folder via build_retail_workbooks.py.

.EXAMPLE
  npm run weather:sync-weeklydrop
#>
param([switch]$WhatIf)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
if (Test-Path -LiteralPath $EnvLocal) {
  Get-Content -LiteralPath $EnvLocal | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path ("Env:" + $matches[1].Trim()) -Value $matches[2].Trim()
    }
  }
}

$dataRoot = $env:PORTAL_DATA_ROOT
if (-not $dataRoot) {
  $dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
}
$dataRoot = ($dataRoot.Trim() -replace "/", "\").TrimEnd("\")

$weeklyDrop = $env:WEATHER_WEEKLY_DROP
if (-not $weeklyDrop) {
  $weeklyDrop = Join-Path $dataRoot "Weather\WeeklyDrop"
}
$weeklyDrop = ($weeklyDrop.Trim() -replace "/", "\").TrimEnd("\")

$jsFiles2 = $env:WEATHER_JS_FILES2_DROP
if (-not $jsFiles2) {
  $jsFiles2 = "\\192.168.190.10\Claude Sandbox\JS Files 2\Weather"
}

$wxRoot = $env:WEATHER_DATA_ROOT
if (-not $wxRoot) {
  $wxRoot = "\\192.168.190.10\Claude Sandbox\JS Files\Weather Data"
}
$wxRoot = ($wxRoot.Trim() -replace "/", "\").TrimEnd("\")
$salesData = Join-Path $wxRoot "Sales Data"

$sets = @(
  @{ Label = "HD FL"; Patterns = @("HD FL Daily*.xlsx") },
  @{ Label = "HD SE"; Patterns = @("HD SE Daily*.xlsx") },
  @{ Label = "HD SW"; Patterns = @("HD SW Daily*.xlsx") },
  @{ Label = "Lowe's"; Patterns = @("LOWES Daily Retail Sales*.xlsx"); Exclude = "STX" },
  @{ Label = "Lowe's STX.NTX"; Patterns = @("LOWES Daily Retail Sales STX*.xlsx"); Exclude = "" }
)

function Get-NewestMatch {
  param([string[]]$Dirs, [string[]]$Patterns, [string]$Exclude = "")
  $best = $null
  foreach ($dir in $Dirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    foreach ($pat in $Patterns) {
      $hits = Get-ChildItem -LiteralPath $dir -Filter $pat -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "~\$" }
      if ($Exclude) {
        $hits = $hits | Where-Object { $_.Name -notmatch $Exclude }
      }
      foreach ($h in $hits) {
        if (-not $best -or $h.LastWriteTime -gt $best.LastWriteTime) {
          $best = $h
        }
      }
    }
  }
  return $best
}

if (-not (Test-Path -LiteralPath $salesData)) {
  New-Item -ItemType Directory -Path $salesData -Force | Out-Null
}

$sourceDirs = @($weeklyDrop, $jsFiles2) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if ($sourceDirs.Count -eq 0) {
  Write-Host "No weather source folders reachable (VPN?): $weeklyDrop ; $jsFiles2" -ForegroundColor Red
  exit 1
}

Write-Host "Weather sales sync -> $salesData" -ForegroundColor Cyan
Write-Host "  Sources: $($sourceDirs -join ' | ')" -ForegroundColor Gray

$copied = 0
foreach ($set in $sets) {
  $src = Get-NewestMatch -Dirs $sourceDirs -Patterns $set.Patterns -Exclude $set.Exclude
  if (-not $src) {
    Write-Host "  SKIP $($set.Label): no file in WeeklyDrop or JS Files 2" -ForegroundColor Yellow
    continue
  }
  $dest = Join-Path $salesData $src.Name
  $doCopy = $true
  if (Test-Path -LiteralPath $dest) {
    $existing = Get-Item -LiteralPath $dest
    if ($existing.Length -eq $src.Length -and $existing.LastWriteTimeUtc -ge $src.LastWriteTimeUtc) {
      $doCopy = $false
    }
  }
  if ($doCopy) {
    if ($WhatIf) {
      Write-Host "  WOULD COPY $($set.Label): $($src.Name)" -ForegroundColor DarkCyan
    } else {
      Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
      Write-Host "  OK $($set.Label): $($src.Name)" -ForegroundColor Green
    }
    $copied++
  } else {
    Write-Host "  OK $($set.Label): $($src.Name) (already current)" -ForegroundColor DarkGray
  }
}

if ($copied -eq 0) {
  Write-Host "Daily weather sales files unchanged." -ForegroundColor Cyan
} else {
  Write-Host "Synced $copied daily sales file(s)." -ForegroundColor Green
}
