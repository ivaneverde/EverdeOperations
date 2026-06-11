# Full production zip (dist + node_modules) — matches the June 1 deploy that worked on Linux.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npm ci
npm run build
npm ci --omit=dev

$zipPath = Join-Path $root "deploy-prod.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $env:TEMP "teams-claude-bot-prod"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item package.json, package-lock.json -Destination $stage
Copy-Item dist -Destination (Join-Path $stage "dist") -Recurse
Copy-Item node_modules -Destination (Join-Path $stage "node_modules") -Recurse

Push-Location $stage
tar.exe -acf $zipPath *
Pop-Location
Remove-Item $stage -Recurse -Force

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($mb MB)" -ForegroundColor Green
