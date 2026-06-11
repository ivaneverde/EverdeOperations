# Terminal 2 helper - exposes local bot (port 3978) to HTTPS for Azure Bot.
$ErrorActionPreference = "Stop"

$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrok) {
  Write-Host "ngrok is not installed." -ForegroundColor Red
  Write-Host "Install: winget install ngrok.ngrok"
  Write-Host "Or download: https://ngrok.com/download"
  Write-Host "Then sign in: ngrok config add-authtoken YOUR_TOKEN"
  exit 1
}

Write-Host "Forwarding HTTPS to http://localhost:3978" -ForegroundColor Cyan
Write-Host "Copy the https forwarding URL and set Azure Bot messaging endpoint to:"
Write-Host '  https://YOUR-SUBDOMAIN.ngrok-free.app/api/messages'
Write-Host ""

& ngrok http 3978
