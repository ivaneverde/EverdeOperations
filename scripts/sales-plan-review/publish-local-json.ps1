#Requires -Version 5.1
<# Publish public/sales_plan_data.json to Azure Blob using .env.local #>
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
Get-Content -LiteralPath $EnvLocal | ForEach-Object {
  $line = $_.Trim()
  if ($line -match "^\s*#" -or $line -eq "") { return }
  if ($line -match "^([^=]+)=(.*)$") {
    Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}
$json = Join-Path $RepoRoot "public\sales_plan_data.json"
if (-not (Test-Path -LiteralPath $json)) {
  Write-Error "Missing $json. Run: npm run sales-plan:bootstrap-json"
}
Push-Location $RepoRoot
try {
  node scripts/sales-plan-review/publish-dashboard-data.mjs $json
} finally {
  Pop-Location
}
