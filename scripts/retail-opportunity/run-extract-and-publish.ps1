#Requires -Version 5.1
<#
.SYNOPSIS
  Read five weekly retail workbooks from DataDrops\SalesOpportunity, extract JSON, publish to Azure Blob.

.DESCRIPTION
  Loads .env.local from repo root (AZURE_*, PORTAL_DATA_ROOT, RETAIL_PYTHON).

  Default drop folder:
    \\192.168.190.10\Claude Sandbox\DataDrops\SalesOpportunity

  Falls back to DataDrops\West Coast Retail Opportunity if SalesOpportunity is empty.

  Runs extract_retail_opp.py → public/retail_opp_data.json → Blob.
  Generate workbooks first with npm run retail:build-workbooks or retail:full-pipeline.

.EXAMPLE
  npm run retail:extract-publish
  .\scripts\retail-opportunity\run-extract-and-publish.ps1 -Folder "\\...\SalesOpportunity" -SkipPublish
#>
param(
  [string]$Folder = "",
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
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

function Test-FiveRetailFiles([string]$Dir) {
  if (-not (Test-Path -LiteralPath $Dir)) { return $false }
  $patterns = @(
    "Sales Manager Summary*.xlsx",
    "HD Sales Variance*.xlsx",
    "LOW Sales Variance*.xlsx",
    "*Item*Miss*.xlsx",
    "FOR Source Miss*.xlsx"
  )
  foreach ($p in $patterns) {
    $hit = Get-ChildItem -LiteralPath $Dir -Filter $p -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch "Archive|~\$" }
    if (-not $hit) { return $false }
  }
  return $true
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

$drop = ""
if ($Folder.Trim()) {
  $drop = ($Folder.Trim() -replace "/", "\").TrimEnd("\")
} elseif ($env:RETAIL_WEEKLY_DROP) {
  $drop = ($env:RETAIL_WEEKLY_DROP.Trim() -replace "/", "\").TrimEnd("\")
} else {
  $primary = Join-Path $dataRoot "SalesOpportunity"
  $legacy = Join-Path $dataRoot "West Coast Retail Opportunity"
  if (Test-FiveRetailFiles $primary) {
    $drop = $primary
  } elseif (Test-FiveRetailFiles $legacy) {
    $drop = $legacy
    Write-Host "Using legacy folder: $legacy" -ForegroundColor Yellow
  } else {
    $drop = $primary
  }
}

if (-not (Test-Path -LiteralPath $drop)) {
  throw "Retail drop folder not found: $drop"
}

$outJson = Join-Path $RepoRoot "public\retail_opp_data.json"
$extract = Join-Path $ScriptDir "extract_retail_opp.py"

Write-Host "Retail extract from: $drop" -ForegroundColor Cyan
& $python $extract --folder $drop --out $outJson
if ($LASTEXITCODE -ne 0) { throw "extract_retail_opp.py failed with exit $LASTEXITCODE" }

if (-not (Test-Path -LiteralPath $outJson)) {
  throw "Expected output missing: $outJson"
}

Write-Host "Wrote $outJson" -ForegroundColor Green

if ($SkipPublish) {
  Write-Host "SkipPublish set; not uploading to Blob." -ForegroundColor Yellow
  exit 0
}

Push-Location $RepoRoot
try {
  & npm run publish:retail-json -- $outJson
  if ($LASTEXITCODE -ne 0) { throw "publish:retail-json failed with exit $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "Retail dashboard JSON published." -ForegroundColor Green
