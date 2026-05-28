# Everde portal agent — VM / new PC handoff (Aaron)

This PC is the **agent**: it reads files on the LAN share (VPN) and publishes JSON to Azure so https://everde-operations.vercel.app stays current. Vercel never mounts `\\192.168.190.10\...`.

Full task list: `WEEKLY_DROP_AGENT.md`.

## One-time install (≈15 minutes)

1. **Clone repo** (example path `C:\Everde\everde-ai-operations`):
   ```powershell
   git clone https://github.com/ivaneverde/EverdeOperations.git C:\Everde\everde-ai-operations
   cd C:\Everde\everde-ai-operations
   npm install
   ```

2. **Install runtime**
   - [Node.js 20+](https://nodejs.org/) — `node -v`, `npm -v`
   - [Python 3.11+](https://www.python.org/) — add to PATH; `pip install openpyxl pandas numpy requests matplotlib reportlab`
   - [Git for Windows](https://git-scm.com/) — for nursery Monday push only

3. **VPN** — confirm Explorer opens:
   - `\\192.168.190.10\Claude Sandbox\DataDrops`
   - `\\192.168.190.10\Claude Sandbox\JS Files\Weather Data`

4. **Secrets** — copy `.env.example` → `.env.local` in repo root (get connection string from Ivan; never commit).

5. **Register Windows tasks** (run as the user who will stay logged in or has stored credentials):
   ```powershell
   cd C:\Everde\everde-ai-operations
   npm run weekly:register-tasks
   ```

6. **Smoke test** (VPN on):
   ```powershell
   powershell -File scripts/windows/run-scheduled-weather.ps1 -Force
   powershell -File scripts/windows/run-scheduled-sales-plan.ps1 -Force
   ```

## What runs automatically

| Task | When | Command chain |
|------|------|----------------|
| Sales Plan | Daily 8:00 | WeeklyDrop → `npm run sales-plan:extract-publish` |
| Freight | Mon 9:00 | WeeklyDrop → freight pipeline → Blob |
| Weather | Daily 9:30 | Share `fetch_weather_v2.py` → `npm run weather:share-pipeline` |
| Retail | Mon 10:00 | Build workbooks → extract → Blob |
| Nursery | Mon 13:30 | Inventory Metrics → HTML → `git push` |

Logs: `C:\Everde\everde-ai-operations\.everde-scheduler\logs\`

## Optional desktop shortcut (double-click test)

Create `C:\Everde\Run-Everde-Weather-Now.bat`:

```bat
@echo off
cd /d C:\Everde\everde-ai-operations
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-scheduled-weather.ps1 -Force
pause
```

Change the path if the repo lives elsewhere.

## Manual commands (operator)

```powershell
cd C:\Everde\everde-ai-operations
npm run weather:share-pipeline      # daily weather + Blob
npm run weather:full-pipeline       # + sales×weather when share scripts + sales files ready
npm run retail:full-pipeline
npm run sales-plan:extract-publish
```

## Moving off Ivan’s laptop

1. Old PC: `npm run weekly:unregister-tasks` (optional).
2. New PC: repeat **One-time install**.
3. Copy folder `.everde-scheduler\` if you want to preserve “already processed” fingerprints (optional).
4. **Only one PC** should run the tasks.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Task “ran” but portal stale | VPN; `.env.local` Azure string; log file in `.everde-scheduler\logs` |
| Weather task yellow / exit 0 | Share path missing — connect VPN |
| Sales plan skipped | Both xlsx in `DataDrops\Sales Plan Review\WeeklyDrop\` |
| Nursery push failed | `git push` credentials for scheduled user |

## Not on the agent (yet)

- **Oregon Sales Plan** — needs OR workbook + model on share; see `scripts/sales-plan-review/OR_ROLLOUT.md`.
- **Teams integration** — portal placeholder only (no Microsoft Graph).
- **Full ETL to database** — long-term: all share feeds sync to cloud DB; today = JSON files in Azure Blob.
