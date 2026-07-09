#Requires -Version 5.1
<#
.SYNOPSIS
  Build, upload, and point WEBSITE_RUN_FROM_PACKAGE at the new Teams bot package.

.EXAMPLE
  .\scripts\deploy-run-from-package.ps1
  .\scripts\deploy-run-from-package.ps1 -SkipBuild
#>
param(
  [string]$ResourceGroup = "everdeportal",
  [string]$AppName = "everde-claude-teams-bot",
  [string]$StorageAccount = "everdeblob",
  [string]$Container = "everde-teams-bot",
  [string]$BlobName = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $BlobName.Trim()) {
  $BlobName = "deploy-full-070909-cap-raise-retail.zip"
}

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot "deploy-prod-zip.ps1")
  if ($LASTEXITCODE -ne 0) { throw "deploy-prod-zip.ps1 failed" }
}

$zipPath = Join-Path $root "deploy-prod.zip"
if (-not (Test-Path -LiteralPath $zipPath)) {
  throw "Missing $zipPath"
}

$key = az storage account keys list -g $ResourceGroup -n $StorageAccount --query "[0].value" -o tsv
if (-not $key) { throw "Could not read storage account key for $StorageAccount" }

az storage container create `
  --account-name $StorageAccount `
  --account-key $key `
  --name $Container `
  -o none | Out-Null

Write-Host "Uploading $zipPath -> $StorageAccount/$Container/$BlobName" -ForegroundColor Cyan
az storage blob upload `
  --account-name $StorageAccount `
  --account-key $key `
  --container-name $Container `
  --name $BlobName `
  --file $zipPath `
  --overwrite `
  -o none

$expiry = (Get-Date).AddYears(2).ToUniversalTime().ToString("yyyy-MM-ddTHH:mmZ")
$sas = az storage blob generate-sas `
  --account-name $StorageAccount `
  --account-key $key `
  --container-name $Container `
  --name $BlobName `
  --permissions r `
  --expiry $expiry `
  -o tsv

$packageUrl = "https://$StorageAccount.blob.core.windows.net/$Container/$BlobName`?$sas"

$settingFile = Join-Path $env:TEMP "teams-bot-run-from-package.env"
Set-Content -LiteralPath $settingFile -Value "WEBSITE_RUN_FROM_PACKAGE=$packageUrl" -Encoding UTF8

Write-Host "Updating WEBSITE_RUN_FROM_PACKAGE on $AppName..." -ForegroundColor Cyan
az webapp config appsettings set `
  -g $ResourceGroup `
  -n $AppName `
  --settings "@$settingFile" `
  -o none | Out-Null

az webapp restart -g $ResourceGroup -n $AppName -o none | Out-Null

Write-Host "Deployed. Blob: $BlobName" -ForegroundColor Green
Write-Host "Health: https://$AppName.azurewebsites.net/health (expect build: 2026-07-09-cap-raise-retail)" -ForegroundColor Green
