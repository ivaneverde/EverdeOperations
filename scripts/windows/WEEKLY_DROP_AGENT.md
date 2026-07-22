# Weekly Drop Agent — IT setup (Aaron)

This document describes the **on-premises “agent” machine** that watches `DataDrops` on the LAN share and publishes updates to the hosted Everde Operations portal. The portal on Vercel **cannot** read `\\192.168.190.10\...` directly.

## What runs where

| Time (Pacific) | Task name | Watches | Output |
|----------------|-----------|---------|--------|
| **8:00 AM** | `Everde-SalesPlan-DailyCheck` | `Sales Plan Review\WeeklyDrop\` | Azure Blob `sales_plan_data.json` |
| **9:00 AM** | `Everde-Freight-DailyCheck` | Juanita Load Board share → `Freight\WeeklyDrop\` | Sync raw `.xlsb`, pipeline + Azure Blob `dashboard_data.json` |
| **9:30 AM** | `Everde-Weather-DailyCheck` | `Weather\WeeklyDrop\` (daily sales sync) + `JS Files\Weather Data\scripts\` | Blob `weather_dashboard_data.json` |
| **10:00 AM** | `Everde-Retail-DailyCheck` | `Weather\WeeklyDrop\` + share retail feeds → `SalesOpportunity\` | Blob `retail_opp_data.json` |
| **1:30 PM** | `Everde-Nursery-DailyCheck` | `Inventory Metrics\*.xlsb` | `public/nursery-inventory-dashboard.html` + **git push** |
| **2:30 PM** | *(all daily tasks above)* | Same WeeklyDrop folders | **Catch-up run** — picks up Tue/Wed drops missed by the morning job |

Each job **skips** if no new file since last success (state under `.everde-scheduler/`). A second **2:30 PM** run catches files that land after the morning check (common when reports finish Tuesday or Wednesday). Logs: `.everde-scheduler/logs/`.

**Freight** runs **daily** (morning + 2:30 PM catch-up): the job first copies the newest `Everde Freight Data*.xlsb` from Juanita's Load Board folder (`\\VRD-AWSECS\Everde Central Share\Farms\Performance Reports\Freight Load Board Reports\Load Board Reports\2026`, override with `FREIGHT_SOURCE_DROP` in `.env.local`) into `Freight\WeeklyDrop\`, then runs the pipeline if the raw or dashboard changed. If the Load Board share is unreachable, the job still processes files already in WeeklyDrop (including manual copies). Uses `update.py --skip-fuel-check` so Task Scheduler never waits at `Proceed with current fuel_data.py values? [y/N]`. **Production & Demand (Inventory Metrics)** runs **daily** when a new xlsb appears.

**Agent PC must register tasks once:** `npm run weekly:register-tasks` (no `Everde-*` tasks = nothing runs automatically).

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
| Sales Plan Review | `DataDrops\Sales Plan Review\WeeklyDrop\` | Inventory Transform `*.xlsx`, 2026 Sales by Item `*.xlsx` (agent can auto-copy newest from admin `Planning & Reporting\...\Current Year Sales by Items (Posted Weekly)` via `npm run sales-plan:sync-sales-by-item`); **HD Sales YTD with Following Week Sales`*.xlsx`** (newest → HD portal grid); **`YTD BY STORE SKU*.xlsb`** (Lowe's Following Week — newest → Lowes portal grid; name differs from HD so both can share this folder) |
| Freight | Juanita drops on `\\VRD-AWSECS\...\Load Board Reports\2026\`; agent syncs to `DataDrops\Freight\WeeklyDrop\` | Raw `Everde Freight Data*.xlsb` (not CALIFORNIA ONLY); dashboard `*.xlsx` appears after pipeline |
| Production & Demand | `DataDrops\Inventory Metrics\` | `Inventory Metrics MM DD YY.xlsb` (weekly drop, typically Monday) |
| Weather / Retail (Jonathan) | `DataDrops\Weather\WeeklyDrop\` | **Weekly retail:** newest `HD week*.xlsx` or `HD Sales YTD*.xlsx`, newest `YTD BY STORE SKU*.xlsb` / `Lowes YTD*.xlsb`. **Daily weather sales (optional same folder):** `HD FL/SE/SW Daily*.xlsx`, `LOWES Daily Retail Sales*.xlsx` (main + STX.NTX). Agent syncs daily files → `JS Files\Weather Data\Sales Data\` before weather pipeline. |

**Weather / Retail drop (copy to Brent & Armando):**  
`\\192.168.190.10\Claude Sandbox\DataDrops\Weather\WeeklyDrop`  
Retail rebuild runs **Monday 10:00 AM** on the agent PC when files change. Weather job runs **daily 9:30 AM** (forecast always; sales×weather when daily files are current).

Manual refresh after a drop:
```powershell
npm run weather:sync-weeklydrop
npm run retail:full-pipeline
npm run weather:share-pipeline
```

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
