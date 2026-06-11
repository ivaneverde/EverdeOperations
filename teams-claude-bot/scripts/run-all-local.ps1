# Starts bot + Cloudflare tunnel (use instead of ngrok for Azure Web Chat).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

& (Join-Path $PSScriptRoot "verify-env.ps1")
npm run build | Out-Null

Write-Host "Starting bot in background job..." -ForegroundColor Cyan
$botJob = Start-Job -ScriptBlock {
  Set-Location $using:root
  node dist/index.js
}

Start-Sleep -Seconds 2
$health = try { (Invoke-WebRequest "http://localhost:3978/health" -UseBasicParsing -TimeoutSec 5).Content } catch { $null }
if (-not $health) {
  Stop-Job $botJob -Force
  Receive-Job $botJob
  throw "Bot did not start on port 3978"
}
Write-Host "Bot OK: $health" -ForegroundColor Green

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host "Install cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
  Write-Host "Bot job still running. Stop with: Stop-Job $($botJob.Id); Remove-Job $($botJob.Id)"
  exit 0
}

Write-Host ""
Write-Host "Starting Cloudflare tunnel - copy https URL into Azure messaging endpoint + /api/messages" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop tunnel (bot job $($botJob.Id) keeps running until you stop it)" -ForegroundColor Yellow
& cloudflared tunnel --url http://localhost:3978
