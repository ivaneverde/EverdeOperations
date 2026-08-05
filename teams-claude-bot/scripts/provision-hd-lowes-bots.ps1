#Requires -Version 5.1
<#
.SYNOPSIS
  Provision Everde HD + Everde Lowes Entra apps, Azure Bots, App Service settings, Teams zips.

.NOTES
  Secrets are written to App Service and teams-claude-bot/.env.multi-bot.local (gitignored).
  Do not paste secrets into chat or commit them.
#>
param(
  [string]$ResourceGroup = "everdeportal",
  [string]$AppServiceName = "everde-claude-teams-bot",
  [string]$TenantId = "1efe3bb2-15a5-44f7-b836-7f3dbbc7f5fb",
  [string]$MessagingHost = "https://everde-claude-teams-bot.azurewebsites.net",
  [switch]$SkipAppServiceRestart
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function New-EverdeBotIdentity {
  param(
    [string]$DisplayName,
    [string]$BotResourceName,
    [string]$EndpointPath,
    [string]$SecretLabel
  )

  Write-Host "`n=== $DisplayName ===" -ForegroundColor Cyan

  $existing = az ad app list --display-name $DisplayName --query "[0].appId" -o tsv 2>$null
  if ($existing) {
    Write-Host "Entra app already exists: $existing" -ForegroundColor Yellow
    $appId = $existing.Trim()
  } else {
    Write-Host "Creating Entra app registration..."
    $appJson = az ad app create `
      --display-name $DisplayName `
      --sign-in-audience AzureADMyOrg `
      -o json
    if ($LASTEXITCODE -ne 0) { throw "az ad app create failed for $DisplayName" }
    $app = $appJson | ConvertFrom-Json
    $appId = $app.appId
    Write-Host "Created appId=$appId"
  }

  Write-Host "Creating client secret ($SecretLabel)..."
  $credJson = az ad app credential reset `
    --id $appId `
    --append `
    --display-name $SecretLabel `
    --years 2 `
    -o json
  if ($LASTEXITCODE -ne 0) { throw "az ad app credential reset failed for $DisplayName" }
  $cred = $credJson | ConvertFrom-Json
  $password = $cred.password
  if (-not $password) { throw "No password returned for $DisplayName" }

  # Avoid $ErrorActionPreference=Stop treating az stderr as terminating.
  $botExists = $false
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $botName = az bot show -g $ResourceGroup -n $BotResourceName --query name -o tsv 2>$null
  if ($LASTEXITCODE -eq 0 -and $botName) { $botExists = $true }
  $ErrorActionPreference = $prevEap

  $endpoint = "$MessagingHost$EndpointPath"
  if ($botExists) {
    Write-Host "Azure Bot exists; updating messaging endpoint -> $endpoint"
    az bot update -g $ResourceGroup -n $BotResourceName --endpoint $endpoint -o none
    if ($LASTEXITCODE -ne 0) { throw "az bot update failed for $BotResourceName" }
  } else {
    Write-Host "Creating Azure Bot $BotResourceName ..."
    az bot create `
      -g $ResourceGroup `
      -n $BotResourceName `
      --appid $appId `
      --app-type SingleTenant `
      --tenant-id $TenantId `
      --sku F0 `
      --location global `
      --endpoint $endpoint `
      --display-name $DisplayName `
      -o none
    if ($LASTEXITCODE -ne 0) { throw "az bot create failed for $BotResourceName" }
  }

  Write-Host "Ensuring Microsoft Teams channel..."
  $ErrorActionPreference = "Continue"
  az bot msteams create -g $ResourceGroup -n $BotResourceName -o none 2>$null | Out-Null
  $ErrorActionPreference = $prevEap

  return [pscustomobject]@{
    DisplayName = $DisplayName
    AppId       = $appId
    Password    = $password
    BotName     = $BotResourceName
    Endpoint    = $endpoint
  }
}

$hd = New-EverdeBotIdentity `
  -DisplayName "Everde Teams HD Bot" `
  -BotResourceName "everde-teams-hd" `
  -EndpointPath "/api/messages/hd" `
  -SecretLabel "Everde HD bot 2026"

$lowes = New-EverdeBotIdentity `
  -DisplayName "Everde Teams Lowes Bot" `
  -BotResourceName "everde-teams-lowes" `
  -EndpointPath "/api/messages/lowes" `
  -SecretLabel "Everde Lowes bot 2026"

Write-Host "`n=== App Service settings ===" -ForegroundColor Cyan
# Pass settings as CLI args (more reliable than @file under PowerShell encoding).
az webapp config appsettings set `
  -g $ResourceGroup `
  -n $AppServiceName `
  --settings `
    "MicrosoftAppIdHd=$($hd.AppId)" `
    "MicrosoftAppPasswordHd=$($hd.Password)" `
    "MicrosoftAppIdLowes=$($lowes.AppId)" `
    "MicrosoftAppPasswordLowes=$($lowes.Password)" `
  -o none
if ($LASTEXITCODE -ne 0) { throw "Failed to set App Service settings" }

$localEnv = Join-Path $root ".env.multi-bot.local"
@(
  "# Generated $(Get-Date -Format o) - DO NOT COMMIT"
  "MicrosoftAppIdHd=$($hd.AppId)"
  "MicrosoftAppPasswordHd=$($hd.Password)"
  "MicrosoftAppIdLowes=$($lowes.AppId)"
  "MicrosoftAppPasswordLowes=$($lowes.Password)"
) | Set-Content -LiteralPath $localEnv -Encoding UTF8
Write-Host "Wrote local secrets file: $localEnv" -ForegroundColor Green

if (-not $SkipAppServiceRestart) {
  Write-Host "Restarting $AppServiceName ..."
  az webapp restart -g $ResourceGroup -n $AppServiceName -o none
}

Write-Host ""
Write-Host "=== Summary (no secrets) ===" -ForegroundColor Green
Write-Host ("HD    appId={0}  bot={1}  endpoint={2}" -f $hd.AppId, $hd.BotName, $hd.Endpoint)
Write-Host ("Lowes appId={0}  bot={1}  endpoint={2}" -f $lowes.AppId, $lowes.BotName, $lowes.Endpoint)
Write-Host "Next: build Teams zips with those AppIds, then sideload / Teams Admin."
