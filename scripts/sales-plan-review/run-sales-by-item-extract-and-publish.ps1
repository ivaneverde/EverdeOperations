#Requires -Version 5.1
<#
.SYNOPSIS
  Extract Sales by Item (rep × item × channel) from Shared + WeeklyDrop and publish to Blob.

.EXAMPLE
  npm run sales-plan:sales-by-item-extract-publish
  .\scripts\sales-plan-review\run-sales-by-item-extract-and-publish.ps1 -SkipPublish
#>
param(
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
$weeklyDrop = if ($env:SALES_PLAN_WEEKLY_DROP) {
  ($env:SALES_PLAN_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
} else {
  Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"
}

$sharedSales = if ($env:SALES_BY_ITEM_SHARED) {
  ($env:SALES_BY_ITEM_SHARED.Trim() -replace "/", "\").TrimEnd("\")
} else {
  "\\192.168.190.10\Claude Sandbox\JS Files\Shared\Sales Data"
}

$outDir = Join-Path $RepoRoot "public"
$extractPy = Join-Path $ScriptDir "extract_sales_by_item.py"

Write-Host "Extracting Sales by Item (rep / channel / year)..." -ForegroundColor Cyan
& $python $extractPy --shared-sales $sharedSales --weekly-drop $weeklyDrop --out-dir $outDir
if ($LASTEXITCODE -ne 0) { throw "extract_sales_by_item.py failed" }

if ($SkipPublish) {
  Write-Host "SkipPublish set; artifacts in $outDir" -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  & npm run publish:sales-by-item-json
  if ($LASTEXITCODE -ne 0) { throw "publish:sales-by-item-json failed" }
} finally {
  Pop-Location
}

Write-Host "Sales by Item extract + publish complete." -ForegroundColor Green
