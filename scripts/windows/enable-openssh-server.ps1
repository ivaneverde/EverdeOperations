$ErrorActionPreference = "Stop"
$log = "C:\Users\isunderland\everde-ai-operations\.everde-scheduler\openssh-setup.log"
function Log($m){ "$(Get-Date -Format o) $m" | Out-File $log -Append -Encoding utf8 }
try {
  $cap = Get-WindowsCapability -Online | Where-Object Name -like "OpenSSH.Server*"
  Log ("capability state=" + $cap.State)
  if ($cap -and $cap.State -ne "Installed") {
    Log "Installing OpenSSH.Server..."
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
  }
  if (-not (Get-Service sshd -EA SilentlyContinue)) { throw "sshd service missing" }
  Set-Service -Name sshd -StartupType Automatic
  Start-Service sshd
  if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -EA SilentlyContinue)) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
  } else { Enable-NetFirewallRule -Name "OpenSSH-Server-In-TCP" }
  $sshConf = "$env:ProgramData\ssh\sshd_config"
  if (Test-Path $sshConf) {
    $c = Get-Content $sshConf -Raw
    if ($c -notmatch "DefaultShell") {
      Add-Content $sshConf "`nDefaultShell C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`n"
      Restart-Service sshd
      Log "DefaultShell set"
    }
  }
  Log ("sshd status=" + (Get-Service sshd).Status)
  Log ("listen22=" + [bool](Get-NetTCPConnection -LocalPort 22 -State Listen -EA SilentlyContinue))
  Log "OK"
} catch { Log ("FAIL: " + $_); exit 1 }
