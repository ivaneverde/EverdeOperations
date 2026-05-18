#Requires -Version 5.1
<#
.SYNOPSIS
  Finish after step 23 print crash: copy v16 workbook to Freight + WeeklyDrop (same as update.py publish).

  Use when steps 1-22 (or 23 build) succeeded but update.py aborted on a Unicode print error.

.EXAMPLE
  npm run freight:finish-publish
#>
$ErrorActionPreference = "Stop"

$freight = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight"
$work = Join-Path $freight "_pipeline\_work"
$weekly = Join-Path $freight "WeeklyDrop"
$src = Join-Path $work "Everde_Freight_Dashboard_v16.xlsx"

if (-not (Test-Path -LiteralPath $src)) {
  Write-Error "Missing $src - pipeline did not produce v16."
}

$d = Get-Date
$stamp = "{0}-{1}-{2}" -f $d.Month, $d.Day, ($d.Year % 100).ToString("00")
$name = "Everde Freight Dashboard YTD $stamp (rebuilt).xlsx"
$destFreight = Join-Path $freight $name
$destWeekly = Join-Path $weekly $name

Copy-Item -LiteralPath $src -Destination $destFreight -Force
Write-Host "Copied to: $destFreight" -ForegroundColor Green
if (Test-Path -LiteralPath $weekly) {
  Copy-Item -LiteralPath $src -Destination $destWeekly -Force
  Write-Host "Copied to: $destWeekly" -ForegroundColor Green
}

$len = (Get-Item -LiteralPath $destFreight).Length
Write-Host "Size: $len bytes. Next: npm run freight:extract-publish" -ForegroundColor Cyan
