#Requires -Version 5.1
<#
.SYNOPSIS
  Send the weekly Freight Dashboard via the signed-in Outlook profile.

  NEVER send as Jonathan. NEVER send to the team until Ivan has reviewed.
  Default is a TEST send to isunderland@everde.com only.

.EXAMPLE
  .\send-dashboard-email.ps1 -Workbook "C:\Users\isunderland\FreightHandoff\Everde_Freight_Dashboard_2026-09-29.xlsx"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Workbook,
  [string]$To = "isunderland@everde.com",
  [string]$Cc = "",
  [string]$Subject = "Freight Dashboard Test",
  [string]$BodyFile = "",
  [string]$BodyText = "",
  [switch]$DraftOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Workbook)) {
  throw "Workbook not found: $Workbook"
}

$blocked = @("jsaperstein@everde.com")
function Assert-NotJonathan([string]$addr) {
  foreach ($part in ($addr -split "[;,]")) {
    $p = $part.Trim()
    if (-not $p) { continue }
    foreach ($b in $blocked) {
      if ($p -match [regex]::Escape($b)) {
        throw "Refusing to send as/to Jonathan ($p). Use Everde AI Operations / Ivan only."
      }
    }
  }
}
Assert-NotJonathan $To
Assert-NotJonathan $Cc

if ($BodyFile -and (Test-Path -LiteralPath $BodyFile)) {
  $BodyText = [System.IO.File]::ReadAllText($BodyFile)
}
if (-not $BodyText) {
  throw "Pass -BodyFile or -BodyText"
}

$html = @"
<html>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222">
$BodyText
<p>Thanks,</p>
<p><b>Everde AI Operations</b><br/>
Automated freight dashboard</p>
</body>
</html>
"@

$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = $To
if ($Cc) { $mail.CC = $Cc }
$mail.Subject = $Subject
$mail.HTMLBody = $html
$mail.Attachments.Add((Resolve-Path -LiteralPath $Workbook).Path) | Out-Null

$from = ""
try { $from = [string]$outlook.Session.CurrentUser.Address } catch { $from = [string]$outlook.Session.CurrentUser.Name }
Write-Host "From (Outlook default): $from"
if ($from -match "jsaperstein") {
  throw "Outlook profile is Jonathan. Stop. Switch to Ivan / Everde AI Operations before sending."
}
Write-Host "To: $To"
Write-Host "Subject: $Subject"
Write-Host "Attachment: $Workbook"

if ($DraftOnly) {
  $mail.Save()
  Write-Host "Saved as Outlook DRAFT (not sent)."
} else {
  $mail.Send()
  Write-Host "Sent."
}
