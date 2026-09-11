#Requires -Version 5.1
<#
.SYNOPSIS
  Daily ~9:00 AM: pull XXTT inventory .xls from Gmail (if configured), then
  refresh nursery SUPPLY pane + Blob + git push when the file is new.

.DESCRIPTION
  1) Optional Gmail fetch (XXTT_GMAIL_* in .env.local) into
     DataDrops\Sales Inventory Availability\
  2) Newest XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls (or any .xls in that folder)
  3) nursery:refresh-supply + nursery:publish-blob + git push HTML

  Skips publish when fingerprints are unchanged unless -Force.
  Use -SkipGmail to only process whatever is already in the drop folder.
#>
param(
  [switch]$Force,
  [switch]$SkipGitPush,
  [switch]$SkipGmail
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
    New-Item -ItemType Directory -Path $supplyDir -Force | Out-Null
    Write-Host "Created supply drop folder: $supplyDir" -ForegroundColor Cyan
  }

  if (-not $SkipGmail) {
    $py = if ($env:NURSERY_PYTHON) { $env:NURSERY_PYTHON } elseif ($env:FREIGHT_PYTHON) { $env:FREIGHT_PYTHON } else { "python" }
    $fetchScript = Join-Path $RepoRoot "scripts\nursery\fetch_xxtt_from_gmail.py"
    if (Test-Path -LiteralPath $fetchScript) {
      Write-Host "Fetching XXTT attachment from Gmail (if credentials set)..." -ForegroundColor Cyan
      & $py $fetchScript
      $fetchCode = $LASTEXITCODE
      # 0 = saved/matched, 2 = creds missing (ok - use manual drop), 3 = no new mail
      if ($fetchCode -eq 1) {
        Write-Warning "Gmail fetch failed (exit 1). Continuing with files already in $supplyDir."
      } elseif ($fetchCode -eq 2) {
        Write-Host "Gmail credentials not configured - using drop folder only." -ForegroundColor Yellow
      } elseif ($fetchCode -eq 3) {
        Write-Host "No new matching Gmail attachment in lookback window." -ForegroundColor Cyan
      } elseif ($fetchCode -ne 0) {
        Write-Warning "Gmail fetch exited $fetchCode. Continuing with drop folder."
      }
    } else {
      Write-Warning "Missing $fetchScript - skipping Gmail fetch."
    }
  }

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
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
