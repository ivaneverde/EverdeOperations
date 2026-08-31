# Weekly Drop Agent — IT setup (Aaron)

This document describes the **on-premises “agent” machine** that watches `DataDrops` on the LAN share and publishes updates to the hosted Everde Operations portal. The portal on Vercel **cannot** read `\\192.168.190.10\...` directly.

## What runs where

| Time (Pacific) | Task name | Watches | Output |
|----------------|-----------|---------|--------|
| **8:00 AM** | `Everde-SalesPlan-DailyCheck` | `Sales Plan Review\WeeklyDrop\` | Azure Blob `sales_plan_data.json` |
| **9:00 AM** | `Everde-Freight-DailyCheck` | Juanita Load Board share → `Freight\WeeklyDrop\` | Sync raw `.xlsb`, pipeline + Azure Blob `dashboard_data.json` |
| **9:30 AM** | `Everde-Weather-DailyCheck` | `Weather\WeeklyDrop\` (daily sales sync) + `JS Files\Weather Data\scripts\` | Blob `weather_dashboard_data.json` (**Open-Meteo 7-day forecast always refreshed** before publish; sales×weather crosswalk when share scripts succeed) |
| **10:00 AM** | `Everde-Retail-DailyCheck` | `Weather\WeeklyDrop\` + share retail feeds → `SalesOpportunity\` | Blob `retail_opp_data.json` |
| **12:00 PM** | *(Sales Plan, Freight, Retail, Weather)* | Same drop folders | **Midday check** — Brent/Armando files that land late morning |
| **1:30 PM** | `Everde-Nursery-DailyCheck` | `Inventory Metrics\*.xlsb` + `*Site*Focus*.docx` | `public/nursery-inventory-dashboard.html` + `data/site_focus_data.json` + **git push** |
| **2:30 PM** | *(all daily tasks above)* | Same WeeklyDrop folders | **Catch-up run** — picks up files missed by morning/midday |

| **10:00 AM Mon** | `Everde-NurserySupply-WeeklyCheck` | `DataDrops\Sales Inventory Availability\` (newest `XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls`) | Supply pane HTML + Blob `nursery/latest/nursery_supply_data.json` + **git push** |
| **11:00 AM Mon** | `Everde-WCRO-WeeklyCheck` | `DataDrops\WCRO\` (newest `_HANDOFF_WCRO_*\reports\`) | `data/wcro_data.json` → Blob `wcro/latest/wcro_data.json` |

Each job **skips** if no new file since last success (state under `.everde-scheduler/`). A **12:00 PM** midday check plus a **2:30 PM** catch-up pick up files that land after the morning jobs (common for Brent/Armando dailies and Following Week YTD). Logs: `.everde-scheduler/logs/`.

**WCRO** runs **Monday 11:00 AM** via `npm run weekly:register-tasks` → `run-scheduled-wcro.ps1`. Jonathan drops a new `_HANDOFF_WCRO_*` pack into `DataDrops\WCRO\`; the job extracts the newest pack's `reports\` (published workbooks only — it does not rebuild WCRO from HD/LOW YTD).

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
   powershell -File scripts/windows/run-scheduled-nursery-supply.ps1 -Force
   ```

## Operator drop locations

| Report | Drop folder | Files |
|--------|-------------|-------|
| Sales Plan Review | `DataDrops\Sales Plan Review\WeeklyDrop\` | Inventory Transform `*.xlsx`, 2026 Sales by Item `*.xlsx` (agent can auto-copy newest from admin `Planning & Reporting\...\Current Year Sales by Items (Posted Weekly)` via `npm run sales-plan:sync-sales-by-item`); same Sales by Item file also feeds **Claude `get_sales_by_item`** (rep × channel × year; 2025 history from `Shared\Sales Data\2025 Sales by Item.xlsx`); **HD Sales YTD with Following Week Sales`*.xlsx`** (newest → HD portal grid); **`YTD BY STORE SKU*.xlsb`** (Lowe's Following Week — newest → Lowes portal grid; name differs from HD so both can share this folder) |
| Freight | Juanita drops on `\\VRD-AWSECS\...\Load Board Reports\2026\`; agent syncs to `DataDrops\Freight\WeeklyDrop\` | Raw `Everde Freight Data*.xlsb` (not CALIFORNIA ONLY); dashboard `*.xlsx` appears after pipeline |
| Production & Demand | `DataDrops\Inventory Metrics\` | `Inventory Metrics MM DD YY.xlsb` (weekly drop, typically Monday); optional `WkNN_Site_Focus_Summary*.docx` → portal **Site Focus Summary** subsection |
| Supply Inventory (XXTT) | `DataDrops\Sales Inventory Availability\` | Newest `XXTT_INV_QA_LANDSCAPE_INV_PL_*.xls` — **Monday 10:00 AM** agent refreshes supply pane + Blob (`npm run nursery:refresh-supply`) |
| Weather / Retail (Jonathan) | `DataDrops\Weather\WeeklyDrop\` | **Weekly retail:** newest `HD week*.xlsx` or `HD Sales YTD*.xlsx`, newest `YTD BY STORE SKU*.xlsb` / `Lowes YTD*.xlsb`. **Daily weather sales (optional same folder):** `HD FL/SE/SW Daily*.xlsx`, `LOWES Daily Retail Sales*.xlsx` (main + STX.NTX). |
| WCRO | `DataDrops\WCRO\` | Newest `_HANDOFF_WCRO_*` pack (`reports\` with Store Driven, Combined Summary, On Hand & Register, Rep Orders). Transfers / Sales Variance are optional (retired 5.32–5.37). |

**Weather / Retail drop (copy to Brent & Armando):**  
`\\192.168.190.10\Claude Sandbox\DataDrops\Weather\WeeklyDrop`  

Daily agent jobs already watch this folder:
- **9:30 AM + 12:00 PM + 2:30 PM** Weather — newest `HD FL/SE/SW Daily*` + `LOWES Daily*` → sales×weather Blob  
- **10:00 AM + 12:00 PM + 2:30 PM** Retail — rebuilds when HD/Lowe's YTD (or other sources) change  
- **8:00 AM + 12:00 PM + 2:30 PM** Sales Plan — also picks up HD/Lowe's Following Week YTD from Weather\WeeklyDrop (copies into Sales Plan Review\WeeklyDrop, then Blob extract)

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
