# Everde AI Operations — disaster recovery (public / GitHub-safe)

**No secrets in this file.** The filled-in inventory with all credentials lives in **`docs/DISASTER_RECOVERY.md`** on Ivan's laptop — that file is **gitignored**. Email that file to yourself for backup; paste it into Cursor on a new machine.

**Last updated:** 2026-08-28  
**Repo:** https://github.com/ivaneverde/EverdeOperations.git  
**Production portal:** https://everde-operations.vercel.app  
**Teams bot health:** https://everde-claude-teams-bot.azurewebsites.net/health

---

## 1. What survives without your laptop

| System | Cloud location |
|--------|----------------|
| Portal UI | Vercel (auto-deploy from `master`) |
| Teams bots | Azure App Service `everde-claude-teams-bot` |
| Live dashboard JSON | Azure Blob (`everde-freight`) |
| Source code | GitHub |
| Excel feeds | LAN share `\\192.168.190.10\Claude Sandbox\DataDrops` |

Daily data refresh stops only if the lost laptop was the **scheduled agent PC** (hostname `VRD-8FQJYW3`).

---

## 2. Secrets location

| Secret store | Contents |
|--------------|----------|
| **`docs/DISASTER_RECOVERY.md`** (local, gitignored) | Full §3 inventory + ready-to-paste `.env.local` and `teams-claude-bot/.env` |
| Vercel dashboard | Production portal env vars |
| Azure → `everde-claude-teams-bot` → Configuration | Teams bot production settings |
| Entra → App registrations | Client IDs; bot passwords in Azure or local doc |

---

## 3. New machine — quick restore

```powershell
git clone https://github.com/ivaneverde/EverdeOperations.git C:\Users\<you>\everde-ai-operations
cd C:\Users\<you>\everde-ai-operations
npm install
cd teams-claude-bot && npm install && cd ..
```

1. Open your **emailed** `DISASTER_RECOVERY.md` → copy §3.8 into `.env.local`, §3.9 into `teams-claude-bot/.env`
2. VPN on → `npm run dev` → http://localhost:3000
3. Agent PC only: `npm run weekly:register-tasks`

Full steps: see emailed `DISASTER_RECOVERY.md` §4–§5, or `scripts/windows/VM_AGENT_HANDOFF.md`.

---

## 4. Cursor bootstrap (new machine)

```
I'm restoring Everde AI Operations on a new laptop.
Read AGENTS.md and the attached DISASTER_RECOVERY.md (has secrets in §3).
Repo: https://github.com/ivaneverde/EverdeOperations
Help me recreate .env.local, verify health endpoints, and re-register agent tasks if needed.
Do not commit secrets.
```

---

## 5. Key references

| Doc | Purpose |
|-----|---------|
| `AGENTS.md` | Product decisions, testers, pipeline notes |
| `docs/DISASTER_RECOVERY.md` | **Secrets + full recovery** (local/email only) |
| `scripts/windows/WEEKLY_DROP_AGENT.md` | Agent schedule |
| `teams-claude-bot/docs/MULTI_BOT_PROFILES.md` | Teams install matrix |
| `docs/HOSTED_LAUNCH_PLAN.md` | Vercel + Blob architecture |

---

*Commit this file to GitHub. Never commit `docs/DISASTER_RECOVERY.md`.*
