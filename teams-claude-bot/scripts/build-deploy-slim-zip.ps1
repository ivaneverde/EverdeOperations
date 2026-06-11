# Slim Linux zip: prebuilt dist + server-side npm ci (no Windows node_modules).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npm ci
npm run build

$zipPath = Join-Path $root "deploy-slim.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $env:TEMP "teams-claude-bot-slim"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item package.json, package-lock.json, .deployment, deploy.sh -Destination $stage
Copy-Item dist -Destination (Join-Path $stage "dist") -Recurse

Push-Location $stage
tar.exe -acf $zipPath *
Pop-Location
Remove-Item $stage -Recurse -Force

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($mb MB)" -ForegroundColor Green
Write-Host "Deploy: az webapp deploy -g everdeportal -n everde-claude-teams-bot --src-path `"$zipPath`" --type zip --restart true"
