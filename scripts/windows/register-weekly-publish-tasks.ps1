#Requires -Version 5.1
<#
.SYNOPSIS
  Register Windows Task Scheduler jobs for daily DataDrops checks (Pacific times by default).

.DESCRIPTION
  Schedules three per-user tasks on THIS machine (easy to re-run on a different PC later):

    Everde-SalesPlan-DailyCheck     8:00 AM daily — Sales Plan Review\WeeklyDrop -> Azure Blob
    Everde-Freight-WeeklyCheck      9:00 AM Mondays — Freight\WeeklyDrop -> update.py + Azure Blob
    Everde-Nursery-DailyCheck       1:30 PM daily — Inventory Metrics xlsb -> HTML + git push

  Times use the **Windows local clock**. Set the PC to Pacific time, or pass -SalesPlanTime /
  -FreightTime / -NurseryTime adjusted for your timezone.

  Requires: VPN to reach \\192.168.190.10\..., repo .env.local, Node.js, Python (freight/sales plan),
  git credentials for nursery push. See scripts/windows/WEEKLY_DROP_AGENT.md for IT handoff.

.EXAMPLE
  npm run weekly:register-tasks
  powershell -File scripts/windows/register-weekly-publish-tasks.ps1 -Unregister
#>
param(
  [string]$SalesPlanTime = "08:00",
  [string]$FreightTime = "09:00",
  [string]$FreightDay = "Monday",
  [string]$NurseryTime = "13:30",
  [string]$AgentLabel = "",
  [switch]$Unregister
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ps = (Get-Command powershell.exe).Source

$tasks = @(
  @{
    Name = "Everde-SalesPlan-DailyCheck"
    Time = $SalesPlanTime
    Script = "run-scheduled-sales-plan.ps1"
    Schedule = "Daily"
    Description = "Daily: if new files in Sales Plan Review WeeklyDrop, extract and publish to Azure Blob."
  },
  @{
    Name = "Everde-Freight-WeeklyCheck"
    Time = $FreightTime
    Script = "run-scheduled-freight.ps1"
    Schedule = "Weekly"
    Day = $FreightDay
    Description = "Weekly (Mondays): if new freight raw/dashboard in WeeklyDrop, run pipeline and publish to Azure Blob."
  },
  @{
    Name = "Everde-Nursery-DailyCheck"
    Time = $NurseryTime
    Script = "run-scheduled-nursery.ps1"
    Schedule = "Daily"
    Description = "Daily: if new Inventory Metrics xlsb, refresh nursery HTML and git push for Vercel."
  }
)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

$legacyTaskNames = @("Everde-Freight-DailyCheck")

if ($Unregister) {
  foreach ($t in $tasks) {
    Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed: $($t.Name)" -ForegroundColor Yellow
  }
  foreach ($legacy in $legacyTaskNames) {
    Unregister-ScheduledTask -TaskName $legacy -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed legacy: $legacy" -ForegroundColor Yellow
  }
  exit 0
}

foreach ($t in $tasks) {
  $scriptPath = Join-Path $PSScriptRoot $t.Script
  $desc = $t.Description
  if ($AgentLabel) { $desc = "[$AgentLabel] $desc" }

  $action = New-ScheduledTaskAction `
    -Execute $ps `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $RepoRoot

  if ($t.Schedule -eq "Weekly") {
    $dow = [System.Enum]::Parse([System.DayOfWeek], $t.Day, $true)
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dow -At $t.Time
  } else {
    $trigger = New-ScheduledTaskTrigger -Daily -At $t.Time
  }

  Register-ScheduledTask `
    -TaskName $t.Name `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $desc `
    -Force | Out-Null

  $schedLabel = if ($t.Schedule -eq "Weekly") { "weekly on $($t.Day)" } else { "daily" }
  Write-Host "Registered: $($t.Name) $schedLabel at $($t.Time)" -ForegroundColor Green
}

foreach ($legacy in $legacyTaskNames) {
  Unregister-ScheduledTask -TaskName $legacy -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed legacy task: $legacy (replaced by Everde-Freight-WeeklyCheck)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "Machine: $env:COMPUTERNAME | User: $env:USERNAME" -ForegroundColor Cyan
Write-Host "Logs: $RepoRoot\.everde-scheduler\logs\" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test manually:" -ForegroundColor Yellow
Write-Host "  powershell -File scripts/windows/run-scheduled-sales-plan.ps1 -Force" -ForegroundColor Yellow
Write-Host "  powershell -File scripts/windows/run-scheduled-freight.ps1 -Force" -ForegroundColor Yellow
Write-Host "  powershell -File scripts/windows/run-scheduled-nursery.ps1 -Force" -ForegroundColor Yellow
Write-Host ""
Write-Host "IT handoff: scripts/windows/WEEKLY_DROP_AGENT.md" -ForegroundColor Yellow
