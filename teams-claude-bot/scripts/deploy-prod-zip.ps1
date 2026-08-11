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
# Robocopy avoids intermittent Copy-Item failures on locked/partial npm files
$nmSrc = Join-Path $root "node_modules"
$nmDst = Join-Path $stage "node_modules"
robocopy $nmSrc $nmDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules failed with exit $LASTEXITCODE" }

Push-Location $stage
tar.exe -acf $zipPath *
Pop-Location
Remove-Item $stage -Recurse -Force

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($mb MB)" -ForegroundColor Green
