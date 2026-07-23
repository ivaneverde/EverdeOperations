#Requires -Version 5.1
<#
.SYNOPSIS
  Extract newest HD Sales YTD Following Week workbook from WeeklyDrop and publish to Blob.

.EXAMPLE
  npm run sales-plan:hd-ytd-extract-publish
  .\scripts\sales-plan-review\run-hd-ytd-extract-and-publish.ps1 -SkipPublish
#>
param(
  [string]$WeeklyDropPath = "",
  [string]$InputPath = "",
  [switch]$SkipPublish
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
      Set-Item -Path ("Env:" + $matches[1].Trim()) -Value $matches[2].Trim()
    }
  }
}

Import-DotEnvLocal $EnvLocal

$python = $env:SALES_PLAN_PYTHON
if (-not $python) { $python = $env:FREIGHT_PYTHON }
if (-not $python) { $python = "python" }

$dataRoot = "\\192.168.190.10\Claude Sandbox\DataDrops"
if ($env:PORTAL_DATA_ROOT) {
  $dataRoot = ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
}
if ($env:SALES_PLAN_WEEKLY_DROP) {
  $weeklyDrop = ($env:SALES_PLAN_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
} elseif ($WeeklyDropPath) {
  $weeklyDrop = ($WeeklyDropPath.Trim() -replace "/", "\").TrimEnd("\")
} else {
  $weeklyDrop = Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"
}

$outDir = Join-Path $RepoRoot "public"
$extractPy = Join-Path $ScriptDir "extract_hd_ytd_following.py"

$pyArgs = @($extractPy, "--weekly-drop", $weeklyDrop, "--out-dir", $outDir)
if ($InputPath.Trim()) {
  $pyArgs = @($extractPy, "--input", $InputPath.Trim(), "--out-dir", $outDir)
}

Write-Host "Extracting HD YTD Following Week Sales..." -ForegroundColor Cyan
& $python @pyArgs
if ($LASTEXITCODE -ne 0) { throw "extract_hd_ytd_following.py failed" }

$xrefDir = "\\192.168.190.10\Claude Sandbox\JS Files\Shared\Inventory Cross References"
$buildCat = Join-Path $ScriptDir "build_ytd_sku_category_map.py"
Write-Host "Building HD SKU → Plant Category map from xref..." -ForegroundColor Cyan
& $python $buildCat --xref-dir $xrefDir --out-dir $outDir
if ($LASTEXITCODE -ne 0) { Write-Warning "sku category map build failed (YTD publish will continue without it)" }

if ($SkipPublish) {
  Write-Host "SkipPublish set; artifacts in $outDir" -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  & npm run publish:hd-ytd-json
  if ($LASTEXITCODE -ne 0) { throw "publish:hd-ytd-json failed" }
} finally {
  Pop-Location
}

Write-Host "HD YTD extract + publish complete." -ForegroundColor Green
