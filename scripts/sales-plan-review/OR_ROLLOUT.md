# Oregon (OR) Sales Plan Review — rollout status

## Portal wiring (done in repo)

- HTML: `public/Everde_OR_Sales_Plan_Dashboard.html`
- APIs: `/api/sales-plan/or/dashboard-data`, `/api/sales-plan/or/dashboard-html`
- Blob: `sales-plan/or/latest/or_sales_plan_data.json`
- Scripts: `or_forward_patched.py`, `build_or_workbook_patched.py`
- Publish: `npm run sales-plan:or-extract-publish`

## Why the page may still show “Oregon Data Not Yet Available”

The embed is live, but **JSON/workbook must be generated** on the agent PC (VPN) first.

Handoff explicitly lists future regions: FL, OR, SO CAL, TX — each needs its own workbook and dashboard.

## What exists today

| Asset | NOR CAL | OR |
|--------|---------|-----|
| Forward model (`*_forward_patched.py`) | Yes | **No** |
| Workbook builder | Yes | **No** |
| Output workbook on `DataDrops\Sales Plan Review\` | `NOR CAL Forward Looking INV vs Sales Plan *.xlsx` | **Not on share** (config expects `OR Forward Looking YTD Miss vs Inventory 051126.xlsx`) |
| Portal HTML embed | `salesPlanHtmlTab` → NOR CAL dashboard | Placeholder only |
| Azure Blob JSON | `sales_plan_data.json` (NOR CAL) | **None** |

## What you need to do (Claude / analyst)

1. **Produce the OR workbook** on the share (same quality bar as NOR CAL):
   - Path: `DataDrops\Sales Plan Review\OR Forward Looking YTD Miss vs Inventory MMDDYY.xlsx`
   - Update `sourceRelativePath` in `src/config/portal.ts` when the date suffix changes.
2. **OR region model** — clone/adapt `nor_cal_forward_patched.py` for Oregon farms, customers, and historical parquet caches (OR-specific sales history files).
3. **Dashboard** — either:
   - **Option A:** Separate `Everde_OR_Sales_Plan_Dashboard.html` + Blob key `sales-plan/or/latest/or_sales_plan_data.json`, or
   - **Option B:** One HTML with region switch if sheet layout matches NOR CAL output tabs.

If the OR workbook uses the **same tab names** as the NOR CAL output workbook (`Exec Summary`, `Plan by KI`, etc.), the repo extractor can already produce JSON:

```powershell
python scripts/sales-plan-review/extract_sales_plan.py "path\to\OR workbook.xlsx"
```

Then set `meta.region` to `OR` manually or extend the script with `--region OR`.

## Portal wiring (after workbook + JSON exist)

1. Add `salesPlanHtmlTab` (or a dedicated OR embed component) on the OR report in `portal.ts`.
2. Extend Blob paths / API routes if OR uses a separate JSON file (recommended so NOR CAL publish does not overwrite OR).
3. Run extract + publish from the agent PC (`npm run sales-plan:extract-publish` or a new `or-sales-plan:*` script).

## Quick check (VPN on)

```powershell
Test-Path "\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\OR Forward Looking*.xlsx"
Get-ChildItem "\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\"
```

If the OR file only exists on a local drive, copy it into **Sales Plan Review** (or **WeeklyDrop** if that becomes the OR feed folder) so the agent machine can see it.
