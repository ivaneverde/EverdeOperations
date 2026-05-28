#Requires -Version 5.1
<#
.SYNOPSIS
  Extract OR sales plan JSON from newest OR workbook and publish to Azure Blob.
#>
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

$python = $env:SALES_PLAN_PYTHON
if (-not $python) { $python = $env:FREIGHT_PYTHON }
if (-not $python) {
  $pyCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pyCmd) { $python = $pyCmd.Source }
}
if (-not $python) { throw "Python not found." }

$scriptDir = $PSScriptRoot
$dataRoot = if ($env:PORTAL_DATA_ROOT) {
  ($env:PORTAL_DATA_ROOT.Trim() -replace "/", "\").TrimEnd("\")
} else {
  "\\192.168.190.10\Claude Sandbox\DataDrops"
}
$reviewDir = Join-Path $dataRoot "Sales Plan Review"

$wb = Get-ChildItem -LiteralPath $scriptDir -Filter "OR_Forward_Looking*.xlsx" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $wb -and (Test-Path -LiteralPath $reviewDir)) {
  $wb = Get-ChildItem -LiteralPath $reviewDir -Filter "OR_Forward_Looking*.xlsx" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $wb) {
  throw "No OR_Forward_Looking*.xlsx found. Run build_or_workbook_patched.py first."
}

$outJson = Join-Path $RepoRoot "public\or_sales_plan_data.json"
Write-Host "Extracting $($wb.FullName) ..." -ForegroundColor Cyan
& $python (Join-Path $scriptDir "extract_sales_plan.py") $wb.FullName --region OR
if ($LASTEXITCODE -ne 0) { throw "extract failed" }

$extracted = Join-Path $wb.DirectoryName "or_sales_plan_data.json"
if (Test-Path -LiteralPath $extracted) {
  Copy-Item -LiteralPath $extracted -Destination $outJson -Force
} elseif (-not (Test-Path -LiteralPath $outJson)) {
  throw "or_sales_plan_data.json not produced"
}

Push-Location $RepoRoot
try {
  $env:AZURE_SALES_PLAN_DASHBOARD_JSON_BLOB = "sales-plan/or/latest/or_sales_plan_data.json"
  & npm run publish:sales-plan-json -- $outJson
  if ($LASTEXITCODE -ne 0) { throw "publish failed" }
} finally {
  Pop-Location
}

Write-Host "OR sales plan published." -ForegroundColor Green
