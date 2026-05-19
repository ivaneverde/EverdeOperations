#Requires -Version 5.1
<#
.SYNOPSIS
  Publish weather_dashboard_data.json to Azure Blob (loads .env.local).

.EXAMPLE
  npm run weather:publish
#>
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
$json = Join-Path $RepoRoot "public\weather_dashboard_data.json"

function Import-DotEnvLocal {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
  }
}

Import-DotEnvLocal $EnvLocal

if (-not (Test-Path -LiteralPath $json)) {
  throw "Missing $json — run npm run weather:bootstrap-json first"
}

Push-Location $RepoRoot
try {
  & npm run publish:weather-json -- $json
  if ($LASTEXITCODE -ne 0) { throw "publish:weather-json failed" }
} finally {
  Pop-Location
}

Write-Host "Weather dashboard JSON published." -ForegroundColor Green
