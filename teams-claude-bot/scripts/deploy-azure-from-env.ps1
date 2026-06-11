# Deploy bot to Azure App Service using teams-claude-bot/.env (no laptop tunnel needed).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env"

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile"
}

$keys = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
  if ($_ -match "^\s*([^=]+)=(.*)$") {
    $keys[$Matches[1].Trim()] = $Matches[2].Trim()
  }
}

$required = @("MicrosoftAppId", "MicrosoftAppPassword", "ANTHROPIC_API_KEY", "MicrosoftAppTenantId")
foreach ($name in $required) {
  if (-not $keys[$name]) { Write-Error "Missing $name in .env" }
}

$az = Get-Command az -ErrorAction SilentlyContinue
if (-not $az) {
  Write-Host "Azure CLI not found. Install: winget install Microsoft.AzureCLI" -ForegroundColor Yellow
  Write-Host "Then: az login" -ForegroundColor Yellow
  exit 1
}

$account = az account show 2>$null
if (-not $account) {
  Write-Host "Run: az login" -ForegroundColor Yellow
  az login
}

$model = if ($keys["CLAUDE_MODEL"]) { $keys["CLAUDE_MODEL"] } else { "claude-sonnet-4-6" }

& (Join-Path $root "azure\deploy-app-service.ps1") `
  -ResourceGroup "everdeportal" `
  -Location "westus2" `
  -Sku "F1" `
  -AppName "everde-claude-teams-bot" `
  -MicrosoftAppId $keys["MicrosoftAppId"] `
  -MicrosoftAppPassword $keys["MicrosoftAppPassword"] `
  -AnthropicApiKey $keys["ANTHROPIC_API_KEY"] `
  -MicrosoftAppTenantId $keys["MicrosoftAppTenantId"] `
  -ClaudeModel $model
