#Requires -Version 5.1
<#
.SYNOPSIS
  Add antivirus exclusions for Cursor IDE (run as Administrator).

.DESCRIPTION
  - Windows Defender: adds folder exclusions (helps if Defender is enabled later).
  - ESET Endpoint Security: cannot be changed via CLI on ERA-managed PCs without admin/policy.
    After Defender step, the script prints ESET GUI steps to add the same paths manually.

.EXAMPLE
  Right-click PowerShell -> Run as administrator, then:
  Set-ExecutionPolicy -Scope Process Bypass -Force
  & "C:\Users\isunderland\everde-ai-operations\scripts\windows\add-cursor-security-exclusions.ps1"
#>
$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]$id
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$exclusions = @(
  "$env:LOCALAPPDATA\Programs\cursor",
  "$env:APPDATA\Cursor",
  "$env:LOCALAPPDATA\Cursor",
  "C:\Users\isunderland\everde-ai-operations"
) | ForEach-Object { $_.TrimEnd('\') } | Select-Object -Unique

Write-Host ""
Write-Host "Cursor antivirus exclusions" -ForegroundColor Cyan
Write-Host "Paths:" -ForegroundColor Gray
$exclusions | ForEach-Object { Write-Host "  $_" }

if (-not (Test-IsAdmin)) {
  Write-Host ""
  Write-Host "Not running as Administrator." -ForegroundColor Yellow
  Write-Host "Re-launching elevated (approve the UAC prompt)..." -ForegroundColor Yellow
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arg -Wait
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "--- Windows Defender exclusions ---" -ForegroundColor Cyan
$defenderOk = $false
try {
  $status = Get-MpComputerStatus -ErrorAction Stop
  if ($status.AntivirusEnabled) {
    foreach ($p in $exclusions) {
      if (Test-Path -LiteralPath $p) {
        Add-MpPreference -ExclusionPath $p -ErrorAction Stop
        Write-Host "  Added: $p" -ForegroundColor Green
      } else {
        Write-Host "  Skip (path not found yet): $p" -ForegroundColor DarkYellow
        Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
        Write-Host "  Added anyway (for future install): $p" -ForegroundColor Green
      }
    }
    $defenderOk = $true
    Write-Host "Current Defender path exclusions:" -ForegroundColor Gray
    (Get-MpPreference).ExclusionPath | ForEach-Object { Write-Host "    $_" }
  } else {
    Write-Host "  Defender real-time AV is off (ESET is primary). Skipping." -ForegroundColor DarkYellow
  }
} catch {
  Write-Host "  Defender: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "--- ESET Endpoint Security (manual; ERA-managed) ---" -ForegroundColor Cyan
$esetGui = "C:\Program Files\ESET\ESET Security\egui.exe"
if (Test-Path -LiteralPath $esetGui) {
  Write-Host @"

  Your PC uses ESET Endpoint Security (managed). Add these paths in ESET:

  1. Open ESET (system tray icon or egui).
  2. Press F5 -> Advanced setup (or Setup -> Advanced setup).
  3. Detection engine -> Exclusions -> Edit.
  4. Add each folder (Detection exclusions), type: Path, mask ends with \*:

"@ -ForegroundColor White
  foreach ($p in $exclusions) {
    $mask = if ($p -match '\*$') { $p } else { "$p\*" }
    Write-Host "       $mask" -ForegroundColor Yellow
  }
  Write-Host @"
  5. Optional: Antivirus -> Real-time file system protection -> Exclusions
     (performance exclusions) — add the same paths.
  6. OK -> OK to save.

  If Exclusions are greyed out, ask IT to allowlist these paths in ERA policy.

"@ -ForegroundColor White
  if ([Environment]::UserInteractive) {
    $open = Read-Host "Open ESET GUI now? (y/n)"
    if ($open -eq 'y' -or $open -eq 'Y') {
      Start-Process -FilePath $esetGui
    }
  } else {
    Write-Host "  Run egui manually to add ESET exclusions (see paths above)." -ForegroundColor Gray
  }
} else {
  Write-Host "  ESET egui.exe not found at default path." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Done. If Cursor is removed again, check ESET: Tools -> Log files -> Detected threats." -ForegroundColor Green
Write-Host ""
