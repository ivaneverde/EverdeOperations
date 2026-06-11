# Step 1 only - validates Entra / Bot Framework vars (not Anthropic).
param(
  [string]$EnvFile = (Join-Path (Join-Path $PSScriptRoot "..") ".env")
)

$ErrorActionPreference = "Stop"
$required = @(
  "MicrosoftAppId",
  "MicrosoftAppPassword",
  "MicrosoftAppTenantId"
)

if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile - run: copy .env.example .env"
}

$lines = Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#]" }
$keys = @{}
foreach ($line in $lines) {
  if ($line -match "^\s*([^=]+)=(.*)$") {
    $keys[$Matches[1].Trim()] = $Matches[2].Trim().Trim([char]34)
  }
}

$missing = @()
foreach ($name in $required) {
  if (-not $keys[$name] -or $keys[$name] -eq "") {
    $missing += $name
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing or empty: " + ($missing -join ", "))
}

Write-Host "Step 1 (Entra) environment OK" -ForegroundColor Green
$idPreview = $keys["MicrosoftAppId"].Substring(0, [Math]::Min(8, $keys["MicrosoftAppId"].Length))
$tenantPreview = $keys["MicrosoftAppTenantId"].Substring(0, [Math]::Min(8, $keys["MicrosoftAppTenantId"].Length))
Write-Host "  MicrosoftAppId:       $idPreview..."
Write-Host "  MicrosoftAppTenantId: $tenantPreview..."
Write-Host "  MicrosoftAppPassword: (set)"
