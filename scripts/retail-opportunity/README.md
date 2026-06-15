# West Coast Retail Opportunity — portal pipeline

## Two-step weekly flow

```
Weekly source feeds (share)
    → build_retail_workbooks.py     (5 output .xlsx)
    → extract_retail_opp.py         (retail_opp_data.json)
    → publish to Azure Blob         (portal dashboard)
```

### Step 1 — Source files (weekly)

| Feed | Typical pattern | Where to look |
|------|-----------------|---------------|
| HD store weekly | `HD week X file MMDDYY.xlsx` | `JS Files\Shared\Sales Data\` or weekly drop |
| Lowe's store | `LOW Copy of YTD BY STORE SKU MMDDYY.xlsb` | same |
| Inventory | `Inventory Transform MMDDYY.xlsx` | `Shared\INV\` or Sales Plan WeeklyDrop |
| YTD actuals | `2026 Sales by Item MMDDYY.xlsx` | `Shared\Sales Data\` |
| Sales plan | `2026 Sales Plan by Item.xlsx` | stable; `Shared\Sales Plan\` |
| HD xref | `Home Depot Corp-VN=PO xref*.xlsb` | `Shared\Inventory Cross References\` |
| Lowe's xref | `LOWE'S xref*.xlsb` | same |

**Lowe's fix (May 2026):** store file uses Lowe's SKU in the Item column; `build_retail_workbooks.py` maps SKU → Everde item → SKU group via xref.

### Step 2 — Output drop (canonical)

```
\\192.168.190.10\Claude Sandbox\DataDrops\SalesOpportunity\
```

Five workbooks, e.g. `Sales Manager Summary - Wk14 2026.xlsx` (no “Refresh” suffix required; extract script globs by pattern).

## Commands

```powershell
# Build only (needs VPN + sources on share)
npm run retail:build-workbooks

# Extract + Blob (after workbooks are in SalesOpportunity)
npm run retail:extract-publish

# Build → extract → publish
npm run retail:full-pipeline

# Bootstrap JSON from shipped HTML (offline)
npm run retail:bootstrap-json
```

Python deps for **build**: `pip install pandas openpyxl pyxlsb numpy`

## Scheduler (agent PC)

**Everde-Retail-WeeklyCheck** — Mondays 10:00 AM: `run-scheduled-retail-build.ps1` (build when sources change, then extract/publish when outputs change).

```powershell
npm run weekly:register-tasks
```

Logs: `.everde-scheduler\logs\retail-build-*.log`

## Scripts in this folder

| File | Role |
|------|------|
| `build_retail_workbooks.py` | Generates the 5 weekly workbooks from source feeds |
| `extract_retail_opp.py` | Reads 5 workbooks → `retail_opp_data.json` (`all_stores` = full HD + Lowe's list; `top20_stores` = summary slice) |
| `run-build-workbooks.ps1` | PowerShell wrapper for build |
| `run-extract-and-publish.ps1` | Extract + Azure publish |
| `run-full-pipeline.ps1` | Build then extract/publish |
