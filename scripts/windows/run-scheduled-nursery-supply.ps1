#Requires -Version 5.1
<#
.SYNOPSIS
  Monday ~10:00 AM: refresh nursery SUPPLY pane when a new XXTT Sales Inventory
  Availability .xls appears, publish Blob JSON, and git-push portal HTML.

.DESCRIPTION
  Watches DataDrops\Sales Inventory Availability\ for newest
  XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls (or any .xls in that folder).
  Runs nursery:refresh-supply + nursery:publish-blob, then commits
  public/nursery-inventory-dashboard.html for Vercel.
#>
param(
  [switch]$Force,
  [switch]$SkipGitPush
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("nursery-supply-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $supplyDir = Join-Path $dataRoot "Sales Inventory Availability"

  if (-not (Test-Path -LiteralPath $supplyDir)) {
    Write-Host "Sales Inventory Availability folder not reachable: $supplyDir" -ForegroundColor Yellow
    exit 0
  }

  $xls = Get-ChildItem -LiteralPath $supplyDir -Filter "*.xls" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "~$*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $xls) {
    Write-Host "No .xls files in $supplyDir" -ForegroundColor Yellow
    exit 0
  }

  $fp = Get-FileFingerprint $xls
  $prev = Get-PipelineState $RepoRoot "nursery-supply"
  $need = $Force -or (Test-WeeklyDropNeedsProcessing $xls $prev $prev)

  if (-not $need) {
    Write-Host "No new XXTT supply file since last run ($($xls.Name))." -ForegroundColor Cyan
    exit 0
  }

  Push-Location $RepoRoot
  Write-Host "New supply file: $($xls.Name). Refreshing nursery supply..." -ForegroundColor Green
  & npm run nursery:refresh-supply
  if ($LASTEXITCODE -ne 0) { throw "nursery:refresh-supply failed with exit $LASTEXITCODE" }

  Write-Host "Publishing nursery supply (+ demand) JSON to Azure Blob..." -ForegroundColor Cyan
  & npm run nursery:publish-blob
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "nursery:publish-blob exited $LASTEXITCODE (HTML refresh still usable via git)"
  }

  $publicHtml = Join-Path $RepoRoot "public\nursery-inventory-dashboard.html"
  if (-not (Test-Path -LiteralPath $publicHtml)) {
    throw "Expected output missing: $publicHtml"
  }

  if (-not $SkipGitPush) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
      Write-Warning "git not on PATH; HTML refreshed locally but not pushed."
    } else {
      & git -C $RepoRoot add "public/nursery-inventory-dashboard.html"
      $status = & git -C $RepoRoot status --porcelain -- "public/nursery-inventory-dashboard.html"
      if ($status) {
        $msg = "chore(nursery): refresh Supply Inventory from $($xls.Name)"
        & git -C $RepoRoot commit -m $msg
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
        & git -C $RepoRoot push origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "git push failed (configure credentials on this machine)" }
        Write-Host "Pushed nursery supply HTML to origin." -ForegroundColor Green
      } else {
        Write-Host "No git diff after supply refresh; skip commit." -ForegroundColor Cyan
      }
    }
  }

  Set-PipelineState $RepoRoot "nursery-supply" @{
    path        = $fp.path
    name        = $fp.name
    lastWrite   = $fp.lastWrite
    length      = $fp.length
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Host "Nursery supply publish complete." -ForegroundColor Green
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
