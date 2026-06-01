# Local dev: validate env, install deps, run bot on port 3978
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

& (Join-Path $PSScriptRoot "verify-env.ps1")

if (-not (Test-Path "node_modules")) {
  Write-Host "npm install..."
  npm install
}

Write-Host ""
Write-Host "Starting bot — expose with: ngrok http 3978" -ForegroundColor Cyan
Write-Host "Set Azure Bot messaging endpoint to: https://<ngrok-host>/api/messages"
Write-Host ""

npm run dev
