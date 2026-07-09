param(
  [string]$BlobName = "deploy-full-070926-file-followup.zip"
)
$ErrorActionPreference = "Stop"
$sas = az storage blob generate-sas `
  --account-name everdeblob `
  --container-name everde-teams-bot `
  --name $BlobName `
  --permissions r `
  --expiry 2028-07-09 `
  --https-only `
  -o tsv
if (-not $sas) { throw "Failed to generate SAS" }
$url = "https://everdeblob.blob.core.windows.net/everde-teams-bot/$BlobName`?$sas"
$settingsFile = Join-Path $PWD "package-setting.env"
"WEBSITE_RUN_FROM_PACKAGE=$url" | Set-Content -Path $settingsFile -Encoding ascii -NoNewline
az webapp config appsettings set `
  -g everdeportal `
  -n everde-claude-teams-bot `
  --settings "@$settingsFile" `
  -o none
Remove-Item $settingsFile -Force -ErrorAction SilentlyContinue
az webapp restart -g everdeportal -n everde-claude-teams-bot
Write-Host "WEBSITE_RUN_FROM_PACKAGE updated for $BlobName"
