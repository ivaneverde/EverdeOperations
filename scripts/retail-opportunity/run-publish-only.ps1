#Requires -Version 5.1
param(
  [string]$JsonPath = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"

function Import-DotEnvLocal {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

Import-DotEnvLocal $EnvLocal

$outJson = if ($JsonPath.Trim()) {
  (Resolve-Path -LiteralPath $JsonPath).Path
} else {
  Join-Path $RepoRoot "public\retail_opp_data.json"
}

if (-not (Test-Path -LiteralPath $outJson)) {
  throw "JSON not found: $outJson. Run retail:extract-publish -SkipPublish first."
}

Push-Location $RepoRoot
try {
  & npm run publish:retail-json -- $outJson
  if ($LASTEXITCODE -ne 0) { throw "publish:retail-json failed with exit $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "Retail dashboard JSON published to Blob." -ForegroundColor Green
