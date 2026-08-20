#Requires -Version 5.1
<#
.SYNOPSIS
  Monday (default 11:00 AM): extract newest WCRO handoff under DataDrops\WCRO → Blob.

.DESCRIPTION
  Watches:
    \\...\DataDrops\WCRO\

  Picks the newest `_HANDOFF_WCRO_*` pack that has a reports\ folder (e.g.
  `_HANDOFF_WCRO_5.38_2026-08-17`). Does not recompute Jonathan's engine —
  published workbooks only.

  Skips when fingerprints are unchanged unless -Force.
#>
param([switch]$Force)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\scheduler-state.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Import-EverdeDotEnv (Join-Path $RepoRoot ".env.local")

$logDir = Join-Path $RepoRoot ".everde-scheduler\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("wcro-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
Start-Transcript -Path $logFile -Append | Out-Null

try {
  $dataRoot = Get-DataDropsRoot
  $wcroRoot = Join-Path $dataRoot "WCRO"
  if ($env:WCRO_HANDOFF_ROOT) {
    $wcroRoot = ($env:WCRO_HANDOFF_ROOT.Trim() -replace "/", "\").TrimEnd("\")
  }

  if (-not (Test-Path -LiteralPath $wcroRoot)) {
    New-Item -ItemType Directory -Path $wcroRoot -Force | Out-Null
    Write-Host "Created WCRO drop folder: $wcroRoot" -ForegroundColor Cyan
  }

  $xlsx = @(
    Get-ChildItem -LiteralPath $wcroRoot -Filter "*.xlsx" -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object {
        $_.FullName -notmatch "Archive" -and
        $_.Name -notlike "~$*" -and
        $_.FullName -notmatch "\\\.wcro_extract_sets\\" -and
        $_.FullName -notmatch "\\source_data\\"
      }
  )

  if ($xlsx.Count -eq 0) {
    Write-Host "No WCRO xlsx under $wcroRoot — nothing to extract." -ForegroundColor Yellow
    exit 0
  }

  $newest = $xlsx | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  $fp = Get-FileFingerprint $newest
  $prev = Get-PipelineState $RepoRoot "wcro"
  $needs = $Force -or (Test-WeeklyDropNeedsProcessing $newest $prev.file $prev)

  if (-not $needs -and $prev -and $prev.fileCount) {
    if ([int]$prev.fileCount -ne $xlsx.Count) { $needs = $true }
  }

  if (-not $needs) {
    Write-Host "No new WCRO files since last extract ($($newest.Name))." -ForegroundColor Cyan
    exit 0
  }

  Write-Host "Extracting WCRO from $wcroRoot (newest=$($newest.Name))..." -ForegroundColor Cyan
  $py = if ($env:WCRO_PYTHON) { $env:WCRO_PYTHON } elseif ($env:FREIGHT_PYTHON) { $env:FREIGHT_PYTHON } else { "python" }
  & $py (Join-Path $RepoRoot "scripts\wcro\extract_wcro.py") `
    --handoff-root $wcroRoot `
    --out (Join-Path $RepoRoot "data\wcro_data.json")
  if ($LASTEXITCODE -ne 0) { throw "extract_wcro.py failed with exit $LASTEXITCODE" }

  Copy-Item -Force (Join-Path $RepoRoot "data\wcro_data.json") (Join-Path $RepoRoot "public\wcro_data.json")
  if (Test-Path (Join-Path $RepoRoot "data\change_history_wcro.json")) {
    Copy-Item -Force (Join-Path $RepoRoot "data\change_history_wcro.json") (Join-Path $RepoRoot "public\change_history_wcro.json")
  }

  Write-Host "Publishing WCRO JSON to Azure Blob..." -ForegroundColor Cyan
  Push-Location $RepoRoot
  try {
    npm run publish:wcro-json -- data/wcro_data.json
    if ($LASTEXITCODE -ne 0) { throw "publish:wcro-json failed with exit $LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  Set-PipelineState $RepoRoot "wcro" ([ordered]@{
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
    file        = $fp
    fileCount   = $xlsx.Count
    weeklyDrop  = $wcroRoot
  })

  Write-Host "WCRO extract + publish complete." -ForegroundColor Green
  exit 0
}
catch {
  Write-Host $_ -ForegroundColor Red
  exit 1
}
finally {
  Stop-Transcript | Out-Null
}
