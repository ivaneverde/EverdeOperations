#Requires -Version 5.1
# Shared state for "process only when DataDrops has a newer file" scheduled jobs.

function Get-SchedulerStateDir {
  param([string]$RepoRoot)
  $dir = Join-Path $RepoRoot ".everde-scheduler"
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  return $dir
}

function Get-PipelineState {
  param(
    [string]$RepoRoot,
    [string]$PipelineName
  )
  $path = Join-Path (Get-SchedulerStateDir $RepoRoot) "$PipelineName.json"
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try {
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    Write-Warning "Could not read $path"
    return $null
  }
}

function Set-PipelineState {
  param(
    [string]$RepoRoot,
    [string]$PipelineName,
    [object]$Data
  )
  $path = Join-Path (Get-SchedulerStateDir $RepoRoot) "$PipelineName.json"
  ($Data | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $path -Encoding UTF8
}

function Get-FileFingerprint {
  param([System.IO.FileInfo]$File)
  if (-not $File) { return $null }
  return [ordered]@{
    path      = $File.FullName
    name      = $File.Name
    lastWrite = $File.LastWriteTimeUtc.ToString("o")
    length    = $File.Length
  }
}

function Test-FingerprintChanged {
  param($Stored, $Current)
  if (-not $Current) { return $false }
  if (-not $Stored) { return $true }
  return (
    ($Stored.path -ne $Current.path) -or
    ($Stored.lastWrite -ne $Current.lastWrite) -or
    ([int64]$Stored.length -ne [int64]$Current.length)
  )
}

function Get-ProcessedAtUtc {
  param($Stored)
  if (-not $Stored) { return $null }
  $raw = if ($Stored.processedAt) { $Stored.processedAt } elseif ($Stored.lastRunDate) { $Stored.lastRunDate } else { $null }
  if (-not $raw) { return $null }
  try {
    return [datetime]::Parse($raw).ToUniversalTime()
  } catch {
    return $null
  }
}

function Test-WeeklyDropNeedsProcessing {
  <#
    True when the drop file differs from last published state, or is newer than the last
    successful run (catches manual copies and Tue/Wed drops after the morning job).
  #>
  param(
    [System.IO.FileInfo]$File,
    $StoredFingerprint,
    $StoredState = $null
  )
  if (-not $File) { return $false }
  $fp = Get-FileFingerprint $File
  if (Test-FingerprintChanged $StoredFingerprint $fp) { return $true }
  $processed = Get-ProcessedAtUtc $StoredState
  if (-not $processed) { return $true }
  return ($File.LastWriteTimeUtc -gt $processed)
}

function Import-EverdeDotEnv {
  param([string]$EnvLocalPath)
  if (-not (Test-Path -LiteralPath $EnvLocalPath)) { return }
  Get-Content -LiteralPath $EnvLocalPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path ("Env:" + $matches[1].Trim()) -Value $matches[2].Trim()
    }
  }
}

function Get-DataDropsRoot {
  $root = $env:PORTAL_DATA_ROOT
  if (-not $root) {
    $root = "\\192.168.190.10\Claude Sandbox\DataDrops"
  }
  return ($root.Trim() -replace "/", "\").TrimEnd("\")
}
