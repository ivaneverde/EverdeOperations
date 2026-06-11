# Local dev: validate env, install deps, run bot on port 3978
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

& (Join-Path $PSScriptRoot "verify-env.ps1")

if (-not (Test-Path "node_modules")) {
  Write-Host "npm install..."
  npm install
}

npm run build | Out-Null

Write-Host ""
Write-Host "Starting bot on http://localhost:3978" -ForegroundColor Cyan
Write-Host "In another terminal run: ngrok http 3978" -ForegroundColor Cyan
Write-Host "Azure Bot messaging endpoint example:" -ForegroundColor Cyan
Write-Host '  https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app/api/messages'
Write-Host ""

npm run dev
