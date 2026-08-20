#Requires -Version 5.1
<#
.SYNOPSIS
  Download Teams bot usage NDJSON from Azure Blob and optionally filter.

.EXAMPLE
  .\scripts\pull-usage-log.ps1
  .\scripts\pull-usage-log.ps1 -Day 2026-08-20 -Email jmartin@everde.com
  .\scripts\pull-usage-log.ps1 -DaysBack 7 -Contains "6910"
#>
param(
  [string]$Day = "",
  [int]$DaysBack = 1,
  [string]$Email = "",
  [string]$Contains = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $root -Parent

# Prefer bot .env, then portal .env.local
foreach ($envPath in @(
  (Join-Path $root ".env"),
  (Join-Path $repoRoot ".env.local")
)) {
  if (-not (Test-Path -LiteralPath $envPath)) { continue }
  Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      if ($k -eq "AZURE_STORAGE_CONNECTION_STRING" -or $k -eq "AZURE_FREIGHT_BLOB_CONTAINER") {
        Set-Item -Path "Env:$k" -Value $v
      }
    }
  }
}

if (-not $env:AZURE_STORAGE_CONNECTION_STRING) {
  throw "Set AZURE_STORAGE_CONNECTION_STRING in teams-claude-bot/.env or repo .env.local"
}

$container = if ($env:AZURE_FREIGHT_BLOB_CONTAINER) { $env:AZURE_FREIGHT_BLOB_CONTAINER } else { "everde-freight" }
if (-not $OutDir) { $OutDir = Join-Path $root ".usage-logs" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$days = @()
if ($Day) {
  $days = @($Day)
} else {
  $today = Get-Date
  for ($i = 0; $i -lt [Math]::Max(1, $DaysBack); $i++) {
    $days += $today.AddDays(-$i).ToString("yyyy-MM-dd")
  }
}

$az = Get-Command az -ErrorAction SilentlyContinue
if (-not $az) { throw "Azure CLI (az) required to download blobs." }

$allRows = @()
foreach ($d in $days) {
  $blob = "teams-bot-usage/$d.ndjson"
  $local = Join-Path $OutDir "$d.ndjson"
  Write-Host "Downloading $container/$blob ..." -ForegroundColor Cyan
  $prev = $env:AZURE_STORAGE_CONNECTION_STRING
  # az storage blob download uses connection string via env or --connection-string
  az storage blob download `
    --connection-string $env:AZURE_STORAGE_CONNECTION_STRING `
    --container-name $container `
    --name $blob `
    --file $local `
    --overwrite true 2>$null
  if (-not (Test-Path -LiteralPath $local) -or (Get-Item $local).Length -eq 0) {
    Write-Host "  (no file for $d yet)" -ForegroundColor Yellow
    continue
  }
  Get-Content -LiteralPath $local | ForEach-Object {
    if (-not $_.Trim()) { return }
    try { $allRows += ($_ | ConvertFrom-Json) } catch { }
  }
}

if ($Email) {
  $want = $Email.ToLowerInvariant()
  $allRows = $allRows | Where-Object { $_.email -and $_.email.ToLowerInvariant() -eq $want }
}
if ($Contains) {
  $allRows = $allRows | Where-Object { $_.question -and ($_.question -like "*$Contains*") }
}

Write-Host "`n$($allRows.Count) row(s)" -ForegroundColor Green
$allRows |
  Sort-Object ts |
  Select-Object ts, email, profile, input_tokens, output_tokens, total_tokens, question, tools |
  Format-Table -AutoSize -Wrap

$summary = $allRows | Group-Object email | ForEach-Object {
  [pscustomobject]@{
    email         = $_.Name
    turns         = $_.Count
    input_tokens  = ($_.Group | Measure-Object input_tokens -Sum).Sum
    output_tokens = ($_.Group | Measure-Object output_tokens -Sum).Sum
  }
}
if ($summary) {
  Write-Host "By user:" -ForegroundColor Cyan
  $summary | Sort-Object turns -Descending | Format-Table -AutoSize
}
