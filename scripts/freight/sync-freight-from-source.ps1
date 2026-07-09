#Requires -Version 5.1
<#
.SYNOPSIS
  Copy the newest Juanita freight raw file from the Load Board share into Freight\WeeklyDrop.

.DESCRIPTION
  Source (default): \\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\
    Freight Load Board Reports\Load Board Reports\2026

  Only copies files matching Everde Freight Data*.xlsb (excludes CALIFORNIA ONLY reports).
  Skips copy when WeeklyDrop already has the same name with same size and last-write time.

  Override source: FREIGHT_SOURCE_DROP in .env.local

.EXAMPLE
  npm run freight:sync-source
  powershell -File scripts/freight/sync-freight-from-source.ps1 -WhatIf
#>
param(
  [string]$SourceDir = "",
  [string]$WeeklyDropDir = "",
  [switch]$WhatIf
)

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

if (-not $SourceDir) {
  $SourceDir = $env:FREIGHT_SOURCE_DROP
}
if (-not $SourceDir) {
  $SourceDir = "\\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\Freight Load Board Reports\Load Board Reports\2026"
}

$dataRoot = $env:PORTAL_DATA_ROOT
if (-not $dataRoot) {
  $dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
}
$dataRoot = ($dataRoot.Trim() -replace "/", "\").TrimEnd("\")

if (-not $WeeklyDropDir) {
  if ($env:FREIGHT_WEEKLY_DROP) {
    $WeeklyDropDir = ($env:FREIGHT_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
  } else {
    $WeeklyDropDir = Join-Path $dataRoot "Freight\WeeklyDrop"
  }
}

if (-not (Test-Path -LiteralPath $SourceDir)) {
  Write-Host "Freight source not reachable: $SourceDir" -ForegroundColor Yellow
  Write-Host "Will rely on files already in WeeklyDrop: $WeeklyDropDir" -ForegroundColor Yellow
  $existing = Get-NewestFreightRaw $WeeklyDropDir
  if ($existing) {
    Write-Host "WeeklyDrop newest raw: $($existing.Name)" -ForegroundColor Cyan
    exit 0
  }
  exit 1
}
if (-not (Test-Path -LiteralPath $WeeklyDropDir)) {
  New-Item -ItemType Directory -Path $WeeklyDropDir -Force | Out-Null
}

function Get-NewestFreightRaw {
  param([string]$Dir)
  Get-ChildItem -LiteralPath $Dir -Filter "Everde Freight Data*.xlsb" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "CALIFORNIA" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

$source = Get-NewestFreightRaw $SourceDir
if (-not $source) {
  Write-Host "No Everde Freight Data*.xlsb in source: $SourceDir" -ForegroundColor Yellow
  exit 0
}

$destPath = Join-Path $WeeklyDropDir $source.Name
$dest = Get-Item -LiteralPath $destPath -ErrorAction SilentlyContinue

$needsCopy = $false
if (-not $dest) {
  $needsCopy = $true
  $reason = "not in WeeklyDrop yet"
} elseif ($dest.Length -ne $source.Length -or $dest.LastWriteTimeUtc -lt $source.LastWriteTimeUtc) {
  $needsCopy = $true
  $reason = "source is newer or size changed"
} else {
  $reason = "WeeklyDrop already up to date"
}

Write-Host "Source:  $($source.FullName)" -ForegroundColor Cyan
Write-Host "  Modified: $($source.LastWriteTime)" -ForegroundColor DarkGray
Write-Host "WeeklyDrop: $destPath" -ForegroundColor Cyan

if (-not $needsCopy) {
  Write-Host "No copy needed - $reason." -ForegroundColor Green
  exit 0
}

Write-Host "Copying ($reason)..." -ForegroundColor Green
if ($WhatIf) {
  Write-Host "WhatIf: would copy to $destPath" -ForegroundColor Yellow
  exit 0
}

Copy-Item -LiteralPath $source.FullName -Destination $destPath -Force
Write-Host "Copied: $($source.Name)" -ForegroundColor Green
