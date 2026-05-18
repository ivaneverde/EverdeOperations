# Sales Plan Review — NOR CAL pipeline

Mirrors the freight pattern: Python builds/refreshes the workbook, `extract_sales_plan.py` emits `sales_plan_data.json`, the portal serves JSON from Blob (or `public/sales_plan_data.json`) and the HTML shell loads it via `/api/sales-plan/dashboard-data`.

## Scripts in this folder

| File | Role |
|------|------|
| `extract_sales_plan.py` | Weekly extractor (from Claude handoff) |
| `bootstrap-json-from-html.mjs` | One-time: pull inline `D` from HTML → `public/sales_plan_data.json` |
| `publish-dashboard-data.mjs` | Upload JSON to Azure Blob |
| `sync-share-scripts.ps1` | Copy patched builders from the share into this folder |

## Copy patched builders from the share (required for full pipeline)

On VPN/LAN, run from repo root:

```powershell
powershell -NoProfile -File scripts/sales-plan-review/sync-share-scripts.ps1
```

Source (Everde share):

`\\192.168.190.10\Claude Sandbox\JS Files\Sales Plan Review\`

- `nor_cal_forward_patched.py` (or `nor_cal_forward.py`)
- `build_norcal_workbook_patched.py`

Also copy stable inputs into `scripts/sales-plan-review/stable/` (or point flags):

- `2026 Sales Plan by Item.xlsx`
- `Key Item Report V158.xlsx`
- HD / Lowe's xref `.xlsb`
- `cache/hist_norcal_2023.parquet` (and 2024, 2025)

## Weekly refresh (one command)

1. Drop the two Excel files in:

   `\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop\`

   Drop **only** here (not in the `Sales Plan Review\` root). Newest `Inventory Transform*.xlsx` and `*Sales by Item*.xlsx` are picked automatically.

2. From repo root (VPN on, `.env.local` has `AZURE_STORAGE_CONNECTION_STRING`):

```powershell
npm run sales-plan:extract-publish
```

This runs `extract_sales_plan.py` then uploads `sales_plan_data.json` to Blob. Reload the portal.

### Schedule weekly (optional)

```powershell
npm run weekly:register-tasks
```

Creates Windows tasks **Everde-SalesPlan-Extract-Publish** (default Tuesday 7:00 AM). Machine must be on VPN at run time.

### Manual paths

```powershell
python scripts/sales-plan-review/extract_sales_plan.py `
  --inv "\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop\Inventory Transform 051126.xlsx" `
  --ytd "\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop\2026 Sales by Item 051126.xlsx" `
  --out C:\temp\sales_plan_data.json

npm run publish:sales-plan-json -- C:\temp\sales_plan_data.json
```

Fast path when the output workbook already exists:

```powershell
python scripts/sales-plan-review/extract_sales_plan.py "path\to\NOR_CAL_Forward_Looking_....xlsx"
```

## Portal

- HTML: `public/Everde_NOR_CAL_Sales_Plan_Dashboard.html`
- APIs: `GET /api/sales-plan/dashboard-data`, `GET /api/sales-plan/dashboard-html`
- Admin uploads: Inventory Transform + YTD Sales → Blob `sales-plan/incoming/…` (storage only; run `npm run sales-plan:extract-publish` to refresh live JSON)

Env overrides: `SALES_PLAN_WEEKLY_DROP`, `SALES_PLAN_PYTHON`

See `CURSOR_HANDOFF_Sales_Plan_Review.md` in the Claude zip for tab list and KPI reference.
