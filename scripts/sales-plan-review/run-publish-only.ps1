#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvLocal = Join-Path $RepoRoot ".env.local"
if (Test-Path -LiteralPath $EnvLocal) {
  Get-Content -LiteralPath $EnvLocal | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^\s*#" -or $line -eq "") { return }
    if ($line -match "^([^=]+)=(.*)$") {
      Set-Item -Path ("Env:" + $matches[1].Trim()) -Value $matches[2].Trim()
    }
  }
}
$json = Join-Path $RepoRoot "public\sales_plan_data.json"
Push-Location $RepoRoot
try {
  & npm run publish:sales-plan-json -- $json
  if ($LASTEXITCODE -ne 0) { throw "publish failed" }
} finally {
  Pop-Location
}
