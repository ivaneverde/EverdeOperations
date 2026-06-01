# Builds ClaudeTeamsBot.zip for Teams admin upload / sideload.
param(
  [Parameter(Mandatory)]
  [string]$BotAppId,
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$manifestDir = Join-Path $root "teams-app-manifest"
$outZip = Join-Path $root "ClaudeTeamsBot.zip"

$iconColor = Join-Path $manifestDir "color.png"
$iconOutline = Join-Path $manifestDir "outline.png"
if (-not (Test-Path $iconColor)) {
  Write-Host "Generating placeholder icons..."
  & (Join-Path $PSScriptRoot "generate-placeholder-icons.ps1")
}

$manifestPath = Join-Path $manifestDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw
$manifest = $manifest -replace "00000000-0000-0000-0000-000000000000", $BotAppId
$manifest = $manifest -replace '"version": "1.0.0"', "`"version`": `"$Version`""
$staging = Join-Path $env:TEMP "ClaudeTeamsBot-staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Set-Content -Path (Join-Path $staging "manifest.json") -Value $manifest -Encoding UTF8
Copy-Item $iconColor (Join-Path $staging "color.png")
Copy-Item $iconOutline (Join-Path $staging "outline.png")

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $outZip -Force
Remove-Item $staging -Recurse -Force

Write-Host ""
Write-Host "Teams package ready:" -ForegroundColor Green
Write-Host "  $outZip"
Write-Host "Upload in Teams Admin Center or Manage your apps -> Upload custom app"
