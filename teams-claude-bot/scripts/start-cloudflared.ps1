# Azure Bot-compatible HTTPS tunnel (no ngrok browser warning).
$ErrorActionPreference = "Stop"
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host "Install: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}
Write-Host "Tunneling http://localhost:3978 - copy the https://....trycloudflare.com URL" -ForegroundColor Cyan
Write-Host "Azure messaging endpoint: https://YOUR-URL/api/messages"
Write-Host ""
& cloudflared tunnel --url http://localhost:3978
