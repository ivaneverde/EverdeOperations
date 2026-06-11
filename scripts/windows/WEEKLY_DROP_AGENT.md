# Weekly Drop Agent — IT setup (Aaron)

This document describes the **on-premises “agent” machine** that watches `DataDrops` on the LAN share and publishes updates to the hosted Everde Operations portal. The portal on Vercel **cannot** read `\\192.168.190.10\...` directly.

## What runs where

| Time (Pacific) | Task name | Watches | Output |
|----------------|-----------|---------|--------|
| **8:00 AM** | `Everde-SalesPlan-DailyCheck` | `Sales Plan Review\WeeklyDrop\` | Azure Blob `sales_plan_data.json` |
| **9:00 AM** | `Everde-Freight-DailyCheck` | Juanita Load Board share → `Freight\WeeklyDrop\` | Sync raw `.xlsb`, pipeline + Azure Blob `dashboard_data.json` (non-interactive; no fuel `[y/N]` prompt) |
| **9:30 AM** | `Everde-Weather-DailyCheck` | `JS Files\Weather Data\scripts\` (Open-Meteo fetch) | Blob `weather_dashboard_data.json` |
| **10:00 AM Monday** | `Everde-Retail-WeeklyCheck` | Share retail feeds → `SalesOpportunity\` | Blob `retail_opp_data.json` |
| **1:30 PM Monday** | `Everde-Nursery-WeeklyCheck` | `Inventory Metrics\*.xlsb` | `public/nursery-inventory-dashboard.html` + **git push** |

Times use the **Windows clock** on the agent PC. Set the machine to **Pacific Time**, or adjust times in `register-weekly-publish-tasks.ps1`.

Each job **skips** if no new file since last success (state under `.everde-scheduler/`). Logs: `.everde-scheduler/logs/`.

**Freight** runs **daily**: the job first copies the newest `Everde Freight Data*.xlsb` from Juanita's Load Board folder (`\\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\Freight Load Board Reports\Load Board Reports\2026`, override with `FREIGHT_SOURCE_DROP` in `.env.local`) into `Freight\WeeklyDrop\`, then runs the pipeline if the raw or dashboard changed. Uses `update.py --skip-fuel-check` so Task Scheduler never waits at `Proceed with current fuel_data.py values? [y/N]`. **Production & Demand (Inventory Metrics)** still runs **Mondays** only.

## One-time setup on the agent machine

1. **Clone the repo** (same branch as production, today `master`):
   - `https://github.com/ivaneverde/EverdeOperations.git`
   - Example path: `C:\Everde\everde-ai-operations`

2. **Install**
   - Node.js 20+ (`node`, `npm` on PATH)
   - Python 3.x on PATH (or set `FREIGHT_PYTHON` / `SALES_PLAN_PYTHON` / `WEATHER_PYTHON` in `.env.local`)
   - Git for Windows (for nursery auto-push)

3. **VPN / network**
   - Reliable access to `\\192.168.190.10\Claude Sandbox\DataDrops`
   - Reliable access to `\\VRD-AWSECS\Everde Central Share\...` (freight source; Juanita's Load Board reports)
   - Test: open `DataDrops\Freight\WeeklyDrop` in Explorer

4. **Secrets** — copy `.env.example` → `.env.local` in repo root (never commit). Minimum:
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `AZURE_FREIGHT_BLOB_CONTAINER` (if non-default)
   - Optional: `PORTAL_DATA_ROOT`, `FREIGHT_WEEKLY_DROP`, `FREIGHT_SOURCE_DROP`, `SALES_PLAN_WEEKLY_DROP`, `WEATHER_DATA_ROOT`

5. **Git push (nursery job only)**
   - Configure credentials for `git push` (HTTPS PAT or SSH key) for the user that owns the scheduled tasks
   - Test: `git push origin master` from the repo

6. **Register tasks** (logged in as the task user):
   ```powershell
   cd C:\Everde\everde-ai-operations
   npm install
   npm run weekly:register-tasks
   ```
   Optional label for which PC is the agent:
   ```powershell
   powershell -File scripts/windows/register-weekly-publish-tasks.ps1 -AgentLabel "Ivan-PC"
   ```

7. **Test each pipeline** (with VPN on):
   ```powershell
   powershell -File scripts/windows/run-scheduled-sales-plan.ps1 -Force
   powershell -File scripts/windows/run-scheduled-freight.ps1 -Force
   powershell -File scripts/windows/run-scheduled-weather.ps1 -Force
   powershell -File scripts/windows/run-scheduled-retail-build.ps1 -Force
   powershell -File scripts/windows/run-scheduled-nursery.ps1 -Force
   ```

## Operator drop locations

| Report | Drop folder | Files |
|--------|-------------|-------|
| Sales Plan Review | `DataDrops\Sales Plan Review\WeeklyDrop\` | Inventory Transform `*.xlsx`, 2026 Sales by Item `*.xlsx` |
| Freight | Juanita drops on `\\VRD-AWSECS\...\Load Board Reports\2026\`; agent syncs to `DataDrops\Freight\WeeklyDrop\` | Raw `Everde Freight Data*.xlsb` (not CALIFORNIA ONLY); dashboard `*.xlsx` appears after pipeline |
| Production & Demand | `DataDrops\Inventory Metrics\` | `Inventory Metrics MM DD YY.xlsb` (weekly drop, typically Monday) |

## Moving the agent to another machine later

1. On the **old** machine (optional): `npm run weekly:unregister-tasks` or:
   ```powershell
   powershell -File scripts/windows/register-weekly-publish-tasks.ps1 -Unregister
   ```
2. On the **new** machine: repeat **One-time setup** above.
3. Copy `.everde-scheduler\` from the old repo clone if you want to avoid re-processing the same files (optional).
4. Ensure only **one** machine runs the scheduled tasks (avoid duplicate Blob uploads / git pushes).

See **VM / new PC handoff:** `scripts/windows/VM_AGENT_HANDOFF.md` (Aaron-friendly checklist + optional `.bat` launcher).

## Unregister tasks

```powershell
powershell -File scripts/windows/register-weekly-publish-tasks.ps1 -Unregister
```

## Future improvement (backlog)

**Nursery / Inventory Metrics on Azure Blob** (same pattern as freight): weekly job would only upload JSON—no git commit. Until then, the Monday 1:30 PM job refreshes HTML and pushes to GitHub for Vercel.
