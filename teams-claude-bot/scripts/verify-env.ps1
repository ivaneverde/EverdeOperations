# Validates .env before running the bot locally or deploying.
param(
  [string]$EnvFile = (Join-Path (Join-Path $PSScriptRoot "..") ".env")
)

$ErrorActionPreference = "Stop"
$required = @(
  "MicrosoftAppId",
  "MicrosoftAppPassword",
  "ANTHROPIC_API_KEY"
)

if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile — copy .env.example to .env and fill values."
}

$lines = Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#]' }
$keys = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([^=]+)=(.*)$') {
    $keys[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"')
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

Write-Host "Environment OK ($EnvFile)" -ForegroundColor Green
Write-Host "  MicrosoftAppId: $($keys['MicrosoftAppId'].Substring(0,8))..."
Write-Host "  CLAUDE_MODEL:   $(if ($keys['CLAUDE_MODEL']) { $keys['CLAUDE_MODEL'] } else { '(default)' })"
