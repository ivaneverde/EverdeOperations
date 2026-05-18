#Requires -Version 5.1
<#
.SYNOPSIS
  One-time: move raw Everde Freight Data*.xlsb from Freight\ into Freight\WeeklyDrop\.

  Historical YE files used by 02_load_2022_to_2025.py go to WeeklyDrop\archive\data\.

.EXAMPLE
  npm run freight:migrate-weeklydrop
  npm run freight:migrate-weeklydrop -- -WhatIf
#>
param(
  [switch]$WhatIf,
  [string]$FreightDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $FreightDir) {
  $FreightDir = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight"
}
$weekly = Join-Path $FreightDir "WeeklyDrop"
$archive = Join-Path $weekly "archive\data"

foreach ($d in @($weekly, $archive)) {
  if (-not (Test-Path -LiteralPath $d)) {
    if ($WhatIf) {
      Write-Host "Would create: $d"
    } else {
      New-Item -ItemType Directory -Path $d -Force | Out-Null
      Write-Host "Created: $d" -ForegroundColor Cyan
    }
  }
}

$raw = Get-ChildItem -LiteralPath $FreightDir -Filter "Everde Freight Data*.xlsb" -File -ErrorAction SilentlyContinue
if ($raw.Count -eq 0) {
  Write-Host "No raw .xlsb files in Freight root (already migrated or none present)." -ForegroundColor Yellow
} else {
  foreach ($f in $raw) {
    $dest = Join-Path $weekly $f.Name
    if ($WhatIf) {
      Write-Host "Would move: $($f.FullName) -> $dest"
    } else {
      Move-Item -LiteralPath $f.FullName -Destination $dest -Force
      Write-Host "Moved: $($f.Name)" -ForegroundColor Green
    }
  }
}

$archSrc = Join-Path $FreightDir "archive\data"
if (Test-Path -LiteralPath $archSrc) {
  Get-ChildItem -LiteralPath $archSrc -File -ErrorAction SilentlyContinue | ForEach-Object {
    $dest = Join-Path $archive $_.Name
    if ($WhatIf) {
      Write-Host "Would move archive: $($_.Name) -> $dest"
    } elseif (-not (Test-Path -LiteralPath $dest)) {
      Move-Item -LiteralPath $_.FullName -Destination $dest -Force
      Write-Host "Moved archive: $($_.Name)" -ForegroundColor Green
    }
  }
}

Write-Host "Weekly drop folder: $weekly" -ForegroundColor Cyan
Write-Host "Do not drop new raw files in Freight\ root. Use WeeklyDrop only." -ForegroundColor Yellow
