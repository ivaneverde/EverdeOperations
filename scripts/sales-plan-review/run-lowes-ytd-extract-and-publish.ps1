#Requires -Version 5.1
<#
.SYNOPSIS
  Extract newest Lowe's YTD BY STORE SKU workbook from WeeklyDrop and publish to Blob.

.EXAMPLE
  npm run sales-plan:lowes-ytd-extract-publish
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
$extractPy = Join-Path $ScriptDir "extract_lowes_ytd_following.py"

$pyArgs = @($extractPy, "--weekly-drop", $weeklyDrop, "--out-dir", $outDir)
if ($InputPath.Trim()) {
  $pyArgs = @($extractPy, "--input", $InputPath.Trim(), "--out-dir", $outDir)
}

Write-Host "Extracting Lowe's YTD BY STORE SKU..." -ForegroundColor Cyan
& $python @pyArgs
if ($LASTEXITCODE -ne 0) { throw "extract_lowes_ytd_following.py failed" }

if ($SkipPublish) {
  Write-Host "SkipPublish set; artifacts in $outDir" -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  & npm run publish:lowes-ytd-json
  if ($LASTEXITCODE -ne 0) { throw "publish:lowes-ytd-json failed" }
} finally {
  Pop-Location
}

Write-Host "Lowes YTD extract + publish complete." -ForegroundColor Green
