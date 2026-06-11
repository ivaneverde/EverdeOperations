# Dist-only deploy (reliable on Azure B1 — overwrites dist/ without npm rebuild on server).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npm run build

$zipPath = Join-Path $root "deploy-dist-only.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $env:TEMP "teams-claude-dist-only"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item dist -Destination (Join-Path $stage "dist") -Recurse
@"
[config]
command = echo "dist-only deploy — no build"
"@ | Set-Content (Join-Path $stage ".deployment") -Encoding UTF8

Push-Location $stage
tar.exe -acf $zipPath *
Pop-Location
Remove-Item $stage -Recurse -Force

Write-Host "Created: $zipPath" -ForegroundColor Green
Write-Host "az webapp deploy -g everdeportal -n everde-claude-teams-bot --src-path `"$zipPath`" --type zip --restart true"
