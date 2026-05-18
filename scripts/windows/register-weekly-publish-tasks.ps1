#Requires -Version 5.1
<#
.SYNOPSIS
  Register Windows Task Scheduler jobs for weekly freight + sales plan extract/publish.

.DESCRIPTION
  Runs npm scripts from the repo on a schedule (default: Tuesday 7:00 AM).
  Requires: VPN so \\192.168.190.10\... is reachable, .env.local with AZURE_STORAGE_CONNECTION_STRING,
  Python on PATH (or FREIGHT_PYTHON / SALES_PLAN_PYTHON in .env.local).

  Run once as the user who should own the jobs (elevated not required for per-user tasks).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/windows/register-weekly-publish-tasks.ps1
  powershell -File scripts/windows/register-weekly-publish-tasks.ps1 -DayOfWeek Wednesday -Time "06:30"
#>
param(
  [ValidateSet("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")]
  [string]$DayOfWeek = "Tuesday",
  [string]$Time = "07:00"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  Write-Error "npm not found on PATH. Install Node.js or adjust the task action."
}
$npm = $npmCmd.Source

$actionFreight = New-ScheduledTaskAction `
  -Execute $npm `
  -Argument "run freight:extract-publish" `
  -WorkingDirectory $RepoRoot

$actionSalesPlan = New-ScheduledTaskAction `
  -Execute $npm `
  -Argument "run sales-plan:extract-publish" `
  -WorkingDirectory $RepoRoot

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask `
  -TaskName "Everde-Freight-Extract-Publish" `
  -Action $actionFreight `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Weekly: Freight WeeklyDrop -> extract_data.py -> Azure Blob" `
  -Force | Out-Null

Register-ScheduledTask `
  -TaskName "Everde-SalesPlan-Extract-Publish" `
  -Action $actionSalesPlan `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Weekly: Sales Plan WeeklyDrop -> extract_sales_plan.py -> Azure Blob" `
  -Force | Out-Null

Write-Host "Registered (weekly $DayOfWeek $Time):" -ForegroundColor Green
Write-Host "  Everde-Freight-Extract-Publish" -ForegroundColor Green
Write-Host "  Everde-SalesPlan-Extract-Publish" -ForegroundColor Green
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Ensure VPN is connected at run time. Test manually:" -ForegroundColor Yellow
Write-Host "  npm run freight:extract-publish" -ForegroundColor Yellow
Write-Host "  npm run sales-plan:extract-publish" -ForegroundColor Yellow
