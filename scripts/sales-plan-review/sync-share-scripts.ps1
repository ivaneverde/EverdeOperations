# Copy Sales Plan Review Python builders from the Everde share into scripts/sales-plan-review/
$ErrorActionPreference = "Stop"
$ShareRoot = "\\192.168.190.10\Claude Sandbox\JS Files\Sales Plan Review"
$Dest = Join-Path $PSScriptRoot ""

if (-not (Test-Path $ShareRoot)) {
  Write-Error "Share not reachable: $ShareRoot (connect VPN / LAN first)."
}

$files = @(
  "nor_cal_forward_patched.py",
  "nor_cal_forward.py",
  "build_norcal_workbook.py"
)

foreach ($name in $files) {
  $src = Join-Path $ShareRoot $name
  if (Test-Path $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $Dest $name) -Force
    Write-Host "Copied $name"
  }
}

Write-Host "Done. Run extract_sales_plan.py with --inv and --ytd weekly files."
