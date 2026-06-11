# Build zip for Azure Portal "Zip Deploy" (Kudu) if you prefer not to use az cli.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npm ci
npm run build
npm ci --omit=dev

$zipPath = Join-Path $root "deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $env:TEMP "teams-claude-bot-zip"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item package.json, package-lock.json -Destination $stage
Copy-Item dist -Destination (Join-Path $stage "dist") -Recurse
Copy-Item node_modules -Destination (Join-Path $stage "node_modules") -Recurse

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force
Remove-Item $stage -Recurse -Force

Write-Host "Created: $zipPath" -ForegroundColor Green
Write-Host "Portal: App Service -> Deployment Center -> Zip Deploy (or Kudu zip push)"
