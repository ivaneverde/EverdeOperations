# Cursor on desktop PC → work on this laptop (Everde agent)

Goal: use **Cursor on your workstation PC**, but run everything **on the Everde agent laptop** (`VRD-8FQJYW3`) so shares, Outlook/Excel COM, scheduled tasks, `.env.local`, and deploys behave exactly as if you were sitting at the laptop.

Do **not** treat the Desktop folder/zip copy as the live workspace for bot/portal updates. That copy is backup only. Live work = Remote SSH into this laptop (or sit at the laptop).

## Why Remote SSH (not a second clone)

| Need | Laptop agent | Fresh clone on PC |
|------|--------------|-------------------|
| `\\192.168.190.10\Claude Sandbox\DataDrops` | Already on VPN/LAN | Needs VPN + share access |
| Outlook / Excel COM (freight email, license, load board) | Installed + logged-in session | Separate setup |
| `Everde-*` scheduled tasks | Registered here | Must re-register |
| `.env.local` / bot `.env` | Already present | Copy secrets again |
| `git push` → Vercel portal / Azure bot deploy scripts | Same paths | Same, but agent jobs still on laptop |

## One-time — on the laptop (agent)

1. Enable **OpenSSH Server** (Admin PowerShell):

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue
# Prefer PowerShell for Cursor remote shells
Add-Content "$env:ProgramData\ssh\sshd_config" "`nDefaultShell C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`n"
Restart-Service sshd
```

2. Leave the laptop **powered on**, **logged in** (for Outlook/Excel COM), and on **corp network / VPN** when you need share access.

3. Note addresses (this machine):
   - Hostname: `VRD-8FQJYW3`
   - Ethernet (typical office): `10.178.1.7`
   - Wi‑Fi (home/other): check `ipconfig` — e.g. `192.168.1.38`
   - User: `treetownusa\isunderland` (or `isunderland`)

## One-time — on the workstation PC

1. Install [Cursor](https://cursor.com).
2. Install / enable **Remote - SSH** (Anysphere / Cursor remote SSH).
3. Ensure PC can reach the laptop on port **22** (same LAN/VPN; home may need Tailscale/ZeroTier or VPN into TreeTown).
4. Connect:

   - Command Palette → **Remote-SSH: Connect to Host…**
   - Host example: `isunderland@10.178.1.7`  
     (domain: `treetownusa\isunderland@10.178.1.7` if prompted)
   - Open folder: `C:\Users\isunderland\everde-ai-operations`

5. Optional SSH config on the PC (`%USERPROFILE%\.ssh\config`):

```
Host everde-laptop
    HostName 10.178.1.7
    User isunderland
    # User treetownusa\isunderland
```

Then connect to host `everde-laptop`.

## Day-to-day

1. PC Cursor → Remote SSH → `everde-laptop` → open `everde-ai-operations`.
2. Edit / agent / commit / push as usual — **shell runs on the laptop**.
3. Portal: push `master` → Vercel auto-deploy.
4. Teams bot: deploy from this remote session with the usual `teams-claude-bot` scripts (App Service).
5. Weekly agent jobs keep running on the laptop regardless of which keyboard you use.

## If the PC cannot reach the laptop

- Same building / VPN: use Ethernet IP `10.178.1.7`.
- Different network: use company VPN first, or install a mesh VPN (Tailscale) on **both** machines and SSH to the Tailscale IP.
- Do **not** port-forward SSH to the public internet without locking it down (keys only, no password).

## Backup still useful

Desktop copy / zip remains a cold backup. For live Everde AI bot + portal work from the PC, always Remote SSH into this laptop.
