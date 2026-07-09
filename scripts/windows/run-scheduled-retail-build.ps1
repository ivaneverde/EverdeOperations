#Requires -Version 5.1
<#
.SYNOPSIS
  Daily: build retail workbooks from share sources, then extract + publish if outputs changed.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("retail-build-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $shared = "\\192.168.190.10\Claude Sandbox\JS Files\Shared"
  if ($env:RETAIL_SOURCE_BASE) {
    $shared = ($env:RETAIL_SOURCE_BASE.Trim() -replace "/", "\").TrimEnd("\")
  }

  $searchRoots = @(
    (Join-Path $dataRoot "Weather\WeeklyDrop"),
    $shared,
    (Join-Path $shared "Sales Data"),
    (Join-Path $shared "INV"),
    (Join-Path $dataRoot "Sales Plan Review\WeeklyDrop"),
    $dataRoot
  )

  function Find-NewestRetailSource {
    param([string[]]$Patterns)
    $hits = @()
    foreach ($root in $searchRoots) {
      if (-not (Test-Path -LiteralPath $root)) { continue }
      foreach ($pattern in $Patterns) {
        $hits += Get-ChildItem -LiteralPath $root -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.FullName -notmatch "Archive" -and $_.Name -notlike "~$*" }
      }
    }
    if ($hits.Count -eq 0) { return $null }
    return $hits | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

  $hd = Find-NewestRetailSource @("HD week*.xlsx", "HD_week*.xlsx", "Everything week*HD.xlsx", "HD Sales YTD*.xlsx")
  $low = Find-NewestRetailSource @("YTD BY STORE SKU*.xlsb", "Lowes YTD*.xlsb", "LOW Copy of YTD*.xlsb", "LOWES*YTD*BY*STORE*.xlsb")
  $inv = Find-NewestRetailSource @("Inventory Transform*.xlsx", "Inventory_Transform*.xlsx")
  $actuals = Find-NewestRetailSource @("2026 Sales by Item*.xlsx", "*Sales by Item*.xlsx")
  $plan = Find-NewestRetailSource @("2026 Sales Plan by Item.xlsx")

  if (-not $hd -or -not $low -or -not $inv -or -not $actuals -or -not $plan) {
    Write-Host "Source feeds incomplete - skipping build; will still run extract check." -ForegroundColor Yellow
    if ($hd) { Write-Host "  hd=$($hd.Name)" }
    if ($low) { Write-Host "  low=$($low.Name)" }
    if ($inv) { Write-Host "  inv=$($inv.Name)" }
    if ($actuals) { Write-Host "  actuals=$($actuals.Name)" }
    if ($plan) { Write-Host "  plan=$($plan.Name)" }
  } else {
    $srcFp = @{
      hd      = (Get-FileFingerprint $hd)
      low     = (Get-FileFingerprint $low)
      inv     = (Get-FileFingerprint $inv)
      actuals = (Get-FileFingerprint $actuals)
      plan    = (Get-FileFingerprint $plan)
    }
    $prevSrc = Get-PipelineState $RepoRoot "retail-opportunity-sources"
    $srcChanged = $Force
    if (-not $srcChanged -and $prevSrc) {
      $srcChanged =
        (Test-FingerprintChanged $prevSrc.hd $srcFp.hd) -or
        (Test-FingerprintChanged $prevSrc.low $srcFp.low) -or
        (Test-FingerprintChanged $prevSrc.inv $srcFp.inv) -or
        (Test-FingerprintChanged $prevSrc.actuals $srcFp.actuals) -or
        (Test-FingerprintChanged $prevSrc.plan $srcFp.plan)
    } elseif (-not $prevSrc) {
      $srcChanged = $true
    }

    if ($srcChanged) {
      Write-Host "New retail source files - running build_retail_workbooks.py..." -ForegroundColor Green
      Push-Location $RepoRoot
      & npm run retail:build-workbooks
      if ($LASTEXITCODE -ne 0) { throw "retail:build-workbooks failed" }
      Set-PipelineState $RepoRoot "retail-opportunity-sources" @{
        hd      = $srcFp.hd
        low     = $srcFp.low
        inv     = $srcFp.inv
        actuals = $srcFp.actuals
        plan    = $srcFp.plan
        builtAt = (Get-Date).ToUniversalTime().ToString("o")
      }
    } else {
      Write-Host "Retail source files unchanged since last build." -ForegroundColor Cyan
    }
  }

  $retailArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "run-scheduled-retail.ps1")
  )
  if ($Force) { $retailArgs += "-Force" }
  & powershell @retailArgs
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
