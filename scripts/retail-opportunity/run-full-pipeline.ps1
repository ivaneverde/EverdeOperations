#Requires -Version 5.1
<#
.SYNOPSIS
  Full retail weekly pipeline: build 5 workbooks -> extract JSON -> publish to Blob.

.EXAMPLE
  npm run retail:full-pipeline
  .\scripts\retail-opportunity\run-full-pipeline.ps1 -Week 14 -SkipBuild
#>
param(
  [int]$Week = 0,
  [int]$Year = 0,
  [switch]$SkipBuild,
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ScriptDir = $PSScriptRoot

if (-not $SkipBuild) {
  $buildArgs = @("-File", (Join-Path $ScriptDir "run-build-workbooks.ps1"))
  if ($Week -gt 0) { $buildArgs += @("-Week", $Week) }
  if ($Year -gt 0) { $buildArgs += @("-Year", $Year) }
  $buildArgs += "-SkipIfSourcesMissing"
  & powershell -NoProfile -ExecutionPolicy Bypass @buildArgs
  if ($LASTEXITCODE -ne 0) { throw "retail build step failed" }
}

Push-Location $RepoRoot
try {
  $pubArgs = @("run", "retail:extract-publish")
  if ($SkipPublish) { $pubArgs += "--", "-SkipPublish" }
  & npm @pubArgs
  if ($LASTEXITCODE -ne 0) { throw "retail:extract-publish failed" }
} finally {
  Pop-Location
}

Write-Host "Retail full pipeline complete." -ForegroundColor Green
