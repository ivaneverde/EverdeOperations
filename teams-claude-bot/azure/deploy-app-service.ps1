<#
.SYNOPSIS
  Deploy Everde Teams Claude bot to Azure App Service (Linux, Node 20).

.PREREQUISITES
  - Azure CLI: az login
  - Bot already registered in Entra (MicrosoftAppId + secret)
  - Anthropic API key

.EXAMPLE
  .\azure\deploy-app-service.ps1 `
    -ResourceGroup "rg-everde-teams-claude" `
    -Location "westus2" `
    -AppName "everde-teams-claude-bot" `
    -MicrosoftAppId "<guid>" `
    -MicrosoftAppPassword "<secret>" `
    -AnthropicApiKey "<key>" `
    -MicrosoftAppTenantId "<everde-tenant-guid>"
#>
param(
  [string]$ResourceGroup = "everdeportal",
  [string]$Location = "westus2",
  [string]$AppName = "everde-teams-claude-bot",
  [Parameter(Mandatory)]
  [string]$MicrosoftAppId,
  [Parameter(Mandatory)]
  [string]$MicrosoftAppPassword,
  [Parameter(Mandatory)]
  [string]$AnthropicApiKey,
  [string]$MicrosoftAppTenantId = "",
  [string]$ClaudeModel = "claude-sonnet-4-6",
  [ValidateSet("F1", "B1", "S1")]
  [string]$Sku = "F1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Build ===" -ForegroundColor Cyan
Set-Location $root
npm ci
npm run build

Write-Host "=== Azure resources ===" -ForegroundColor Cyan
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
  az group create --name $ResourceGroup --location $Location | Out-Null
}

$planName = "$AppName-plan"
Write-Host "App Service plan SKU: $Sku (use -Sku B1 after quota increase for production)" -ForegroundColor Cyan
az appservice plan create `
  --name $planName `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku $Sku `
  --is-linux | Out-Null

# NODE:20-lts is not available on Linux App Service; use 22-lts (see: az webapp list-runtimes --os-type linux)
az webapp create `
  --name $AppName `
  --resource-group $ResourceGroup `
  --plan $planName `
  --runtime "NODE:22-lts" | Out-Null

$settings = @{
  MicrosoftAppId                 = $MicrosoftAppId
  MicrosoftAppPassword             = $MicrosoftAppPassword
  MicrosoftAppType                 = "SingleTenant"
  ANTHROPIC_API_KEY                = $AnthropicApiKey
  CLAUDE_MODEL                     = $ClaudeModel
  WEBSITE_NODE_DEFAULT_VERSION     = "~20"
  SCM_DO_BUILD_DURING_DEPLOYMENT   = "false"
  PORT                             = "8080"
  WEBSITES_PORT                    = "8080"
}
if ($MicrosoftAppTenantId) {
  $settings.MicrosoftAppTenantId = $MicrosoftAppTenantId
}

$settingArgs = @()
foreach ($kv in $settings.GetEnumerator()) {
  $settingArgs += "$($kv.Key)=$($kv.Value)"
}
az webapp config appsettings set `
  --name $AppName `
  --resource-group $ResourceGroup `
  --settings @settingArgs | Out-Null

Write-Host "=== Deploy code (zip) ===" -ForegroundColor Cyan
npm ci --omit=dev

$zipPath = Join-Path $env:TEMP "teams-claude-bot-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $env:TEMP "teams-claude-bot-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $root "package.json") $stage
Copy-Item (Join-Path $root "package-lock.json") $stage
Copy-Item (Join-Path $root "dist") (Join-Path $stage "dist") -Recurse
Copy-Item (Join-Path $root "node_modules") (Join-Path $stage "node_modules") -Recurse

# App Service: start compiled entry (no build on server)
az webapp config set `
  --name $AppName `
  --resource-group $ResourceGroup `
  --startup-file "node dist/index.js" | Out-Null

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force
az webapp deployment source config-zip `
  --resource-group $ResourceGroup `
  --name $AppName `
  --src $zipPath | Out-Null

$hostName = az webapp show --name $AppName --resource-group $ResourceGroup --query defaultHostName -o tsv
$endpoint = "https://$hostName/api/messages"

Write-Host ""
Write-Host "=== Deployed ===" -ForegroundColor Green
Write-Host "  App URL:    https://$hostName"
Write-Host "  Health:     https://$hostName/health"
Write-Host "  Bot POST:   $endpoint"
Write-Host ""
Write-Host "NEXT: Azure Portal -> your Azure Bot resource -> Configuration"
Write-Host "      Set messaging endpoint to: $endpoint"
Write-Host "      Enable Microsoft Teams channel"
Write-Host ""
Write-Host "Teams package:" -ForegroundColor Cyan
Write-Host "  .\scripts\build-teams-package.ps1 -BotAppId $MicrosoftAppId"
