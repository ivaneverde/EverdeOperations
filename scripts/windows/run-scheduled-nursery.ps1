#Requires -Version 5.1
<#
.SYNOPSIS
  Daily check (default 1:30 PM local): refresh nursery demand HTML when Inventory Metrics xlsb is new,
  then commit and push public/nursery-inventory-dashboard.html for Vercel.

  Until nursery uses Azure Blob (future), this job needs git credentials on the scheduler account.
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
$logFile = Join-Path $logDir ("nursery-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $metricsDir = Join-Path $dataRoot "Inventory Metrics"

  if (-not (Test-Path -LiteralPath $metricsDir)) {
    Write-Host "Inventory Metrics folder not reachable: $metricsDir" -ForegroundColor Yellow
    exit 0
  }

  $files = Get-ChildItem -LiteralPath $metricsDir -Filter "Inventory Metrics*.xlsb" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  $xlsb = $files | Select-Object -First 1

  if (-not $xlsb) {
    Write-Host "No Inventory Metrics xlsb in $metricsDir" -ForegroundColor Yellow
    exit 0
  }

  $fp = Get-FileFingerprint $xlsb
  $prev = Get-PipelineState $RepoRoot "nursery"

  if (-not $Force -and -not (Test-FingerprintChanged $prev $fp)) {
    Write-Host "No new Inventory Metrics file since last run." -ForegroundColor Cyan
    exit 0
  }

  Write-Host "New file: $($xlsb.Name). Refreshing demand dashboard..." -ForegroundColor Green
  Push-Location $RepoRoot
  & npm run nursery:refresh-demand
  if ($LASTEXITCODE -ne 0) { throw "nursery:refresh-demand failed with exit $LASTEXITCODE" }

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
      $status = & git -C $RepoRoot status --porcelain "public/nursery-inventory-dashboard.html"
      if ($status) {
        $msg = "chore(nursery): refresh Production and Demand Plan from $($xlsb.Name)"
        & git -C $RepoRoot commit -m $msg
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
        & git -C $RepoRoot push origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "git push failed (configure credentials on this machine)" }
        Write-Host "Pushed nursery HTML to origin." -ForegroundColor Green
      } else {
        Write-Host "No git diff after refresh; skip commit." -ForegroundColor Cyan
      }
    }
  }

  Set-PipelineState $RepoRoot "nursery" @{
    path        = $fp.path
    name        = $fp.name
    lastWrite   = $fp.lastWrite
    length      = $fp.length
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
