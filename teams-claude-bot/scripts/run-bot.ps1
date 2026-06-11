# Start bot only (no ngrok). Use when bot is already configured in .env
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

& (Join-Path $PSScriptRoot "verify-env.ps1")
npm run build | Out-Null

Write-Host "Bot running at http://localhost:3978/health" -ForegroundColor Green
node dist/index.js
