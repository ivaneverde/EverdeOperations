# Builds Teams app zip for Claude / Everde HD / Everde Lowes.
param(
  [Parameter(Mandatory)]
  [ValidateSet("full", "hd", "lowes")]
  [string]$Profile,
  [Parameter(Mandatory)]
  [string]$BotAppId,
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$manifestDir = switch ($Profile) {
  "full"  { Join-Path $root "teams-app-manifest" }
  "hd"    { Join-Path $root "teams-app-manifest-hd" }
  "lowes" { Join-Path $root "teams-app-manifest-lowes" }
}

$outName = switch ($Profile) {
  "full"  { "ClaudeTeamsBot.zip" }
  "hd"    { "EverdeHDTeamsBot.zip" }
  "lowes" { "EverdeLowesTeamsBot.zip" }
}
$outZip = Join-Path $root $outName

# Prefer profile icons; fall back to Claude icons / generate placeholders
$iconColor = Join-Path $manifestDir "color.png"
$iconOutline = Join-Path $manifestDir "outline.png"
$claudeColor = Join-Path $root "teams-app-manifest\color.png"
$claudeOutline = Join-Path $root "teams-app-manifest\outline.png"

if (-not (Test-Path $iconColor)) {
  if (Test-Path $claudeColor) {
    Copy-Item $claudeColor $iconColor -Force
    Copy-Item $claudeOutline $iconOutline -Force
  } else {
    Write-Host "Generating placeholder icons..."
    & (Join-Path $PSScriptRoot "generate-placeholder-icons.ps1")
    if ($Profile -ne "full") {
      Copy-Item $claudeColor $iconColor -Force
      Copy-Item $claudeOutline $iconOutline -Force
    }
  }
}

$manifestPath = Join-Path $manifestDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw
# Replaces id, botId, and webApplicationInfo (id + api://botid-…) placeholders.
$manifest = $manifest -replace "00000000-0000-0000-0000-000000000000", $BotAppId
# bump version fields if present
$manifest = $manifest -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
if ($manifest -notmatch '"webApplicationInfo"') {
  throw "Manifest missing webApplicationInfo (required when RSC permissions are present)."
}

$staging = Join-Path $env:TEMP ("EverdeTeamsBot-{0}-staging" -f $Profile)
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Set-Content -Path (Join-Path $staging "manifest.json") -Value $manifest -Encoding UTF8
Copy-Item $iconColor (Join-Path $staging "color.png")
Copy-Item $iconOutline (Join-Path $staging "outline.png")

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $outZip -Force
Remove-Item $staging -Recurse -Force

Write-Host ""
Write-Host "Teams package ready ($Profile):" -ForegroundColor Green
Write-Host "  $outZip"
Write-Host "  botId/appId: $BotAppId"
Write-Host "Upload in Teams Admin Center or Manage your apps -> Upload custom app"
