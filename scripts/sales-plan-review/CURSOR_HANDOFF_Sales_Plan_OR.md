# Everde Operations Portal — OR Sales Plan Review
## Cursor Integration Handoff

**Date:** May 2026  
**Portal:** https://everde-operations.vercel.app  
**Section:** OR Forward-Looking YTD Miss vs Inventory  
**Template:** NOR CAL Sales Plan Review (May 2026)  
**Prepared by:** Claude (Anthropic)

---

## What This Deliverable Contains

| File | Purpose | Drop Location |
|------|---------|---------------|
| `or_forward_patched.py` | Oregon fulfillment model (runs the math) | `JS Files\Sales Plan Review\` |
| `build_or_workbook_patched.py` | Builds the 8-tab OR xlsx workbook | `JS Files\Sales Plan Review\` |
| `Everde_OR_Sales_Plan_Dashboard.html` | Portal dashboard HTML (8 tabs) | Vercel repo via Cursor |
| `CURSOR_HANDOFF_Sales_Plan_OR.md` | This file | Vercel repo |

**Output workbook filename (exact):**
```
OR_Forward_Looking_YTD_Miss_vs_Inventory_MMDDYY.xlsx
```
Example: `OR_Forward_Looking_YTD_Miss_vs_Inventory_052126.xlsx`

**Output workbook drop location:**
```
\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\
```

---

## How to Run the OR Pipeline

### Prerequisites
Same Python environment as NOR CAL. All packages already installed:
```
pandas  openpyxl  pyxlsb  polars  fastexcel  pyarrow
```

### Required input files (same as NOR CAL — shared files)

| File | Location |
|------|---------|
| `Inventory_Transform_MMDDYY.xlsx` | `DataDrops\SalesOpportunity\` (weekly drop) |
| `2026_Sales_by_Item_MMDDYY.xlsx` | `DataDrops\SalesOpportunity\` (weekly drop) |
| `2026_Sales_Plan_by_Item.xlsx` | `JS Files\Shared\Sales Plan\` |
| `Key_Item_Report_V158.xlsx` | `JS Files\Sales Plan Review\` |
| `Home_Depot_Corp-VN_PO_xref_*.xlsb` | `JS Files\Shared\Inventory Cross References\` |
| `LOWE_S_xref_*.xlsb` | `JS Files\Shared\Inventory Cross References\` |

The OR pipeline reads the **same shared source files** as NOR CAL and filters to Oregon accounts internally. No OR-specific source files are needed for first run.

### Optional: OR historical parquet cache

For the Historical Lift tab to populate, create OR-specific parquet files:
```
JS Files\Sales Plan Review\cache_or\
  hist_or_2023.parquet
  hist_or_2024.parquet
  hist_or_2025.parquet
```
If these don't exist, the pipeline falls back to the NOR CAL cache (same West Coast data, just unfiltered). The Historical Lift tab will display a note until OR-specific cache is created.

### Run command
```cmd
cd "\\192.168.190.10\Claude Sandbox\JS Files\Sales Plan Review"
python build_or_workbook_patched.py
```

Or with explicit paths:
```cmd
python build_or_workbook_patched.py ^
  --inv "\\192.168.190.10\Claude Sandbox\DataDrops\SalesOpportunity\Inventory_Transform_052126.xlsx" ^
  --ytd "\\192.168.190.10\Claude Sandbox\DataDrops\SalesOpportunity\2026_Sales_by_Item_052126.xlsx"
```

The script will:
1. Auto-discover the most recent weekly drop files
2. Run `or_forward_patched.py` to compute all model outputs
3. Write the 8-tab xlsx workbook
4. Auto-copy to `DataDrops\Sales Plan Review\`

---

## Portal Integration (Cursor Steps)

### Step 1 — Add the route

In the Vercel project, create:
```
app/
  sales-plan/
    or-sales-plan/
      page.tsx        ← same pattern as NOR CAL page
```

The nav item "OR Forward Looking YTD Miss vs Inventory" already exists in the portal sidebar. Point it to `/sales-plan/or-sales-plan`.

### Step 2 — Add the data endpoint

```
app/
  api/
    or-sales-plan-data/
      route.ts
```

`route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'data', 'or-sales-plan-data.json');
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'OR data not yet available' }, { status: 404 });
  }
}
```

### Step 3 — Wire the dashboard HTML

The HTML file already includes fetch logic:
```javascript
const res = await fetch('/data/or-sales-plan-data.json');
```

When the JSON is not available, it renders a clear "Oregon Data Not Yet Available" panel with setup instructions — not a broken page.

### Step 4 — Add the upload endpoint

Add `POST /upload/or-sales-plan` to the existing upload handler:
```python
@app.post("/upload/or-sales-plan")
async def upload_or_sales_plan(inv_file: UploadFile, ytd_file: UploadFile):
    inv_path = save_upload(inv_file)
    ytd_path = save_upload(ytd_file)
    subprocess.run([
        sys.executable, 'extract_sales_plan.py',
        '--region', 'OR',
        '--inv', inv_path,
        '--ytd', ytd_path,
        '--out', 'static/data/or-sales-plan-data.json'
    ], check=True)
    return {"status": "ok", "message": "OR Sales Plan data updated"}
```

### Step 5 — Schedule via `Everde-SalesPlan-DailyCheck`

The existing `Everde-SalesPlan-DailyCheck` task (daily 8:00 AM) can be extended to also build the OR workbook:

In the task's command, append:
```cmd
&& python build_or_workbook_patched.py
```

Or create a dedicated `Everde-ORSalesPlan-DailyCheck` task on VRD-8FQJYW3 running at 8:15 AM (15 minutes after NOR CAL completes).

---

## Workbook Sheet Names (for extract_sales_plan.py compatibility)

The OR workbook uses identical sheet names as the NOR CAL workbook:

| Sheet | Content |
|-------|---------|
| `Exec Summary` | KPIs, walks, top 20 miss |
| `YTD Performance` | Jan–May actual vs plan vs miss |
| `Miss by KI` | All KIs sorted by miss $ |
| `Miss by Customer` | Per-channel breakdown |
| `Plan by KI` | Forward (Jun–Dec) plan vs inventory |
| `Excess at Farm` | KIs with excess inventory |
| `Historical Lift` | 3-yr smoothed lift (requires cache) |
| `Channel Summary` | Per-customer summary |

The existing `extract_sales_plan.py` can read OR output with a `--region OR` flag — add this flag check to the extractor to write `or-sales-plan-data.json` instead of `sales_plan_data.json`.

---

## OR vs NOR CAL — Key Differences

| | NOR CAL | Oregon |
|--|---------|--------|
| Region label | `NOR CAL` | `OREGON` |
| State codes | CA-NORCAL | OR, Oregon |
| Planting window | Feb–May | Mar–Jun (4–6 weeks later) |
| HD/Lowe's filter | NorCal store IDs | OR zip codes (97xxx) |
| Cache dir | `cache/` | `cache_or/` |
| Output filename | `NOR_CAL_Forward_Looking_*` | `OR_Forward_Looking_YTD_Miss_*` |
| Data JSON | `sales_plan_data.json` | `or-sales-plan-data.json` |

---

## QA Checklist

Before sending to Cursor for portal wiring:

- [ ] Run `build_or_workbook_patched.py` with latest weekly drop files
- [ ] Verify output xlsx appears in `DataDrops\Sales Plan Review\`
- [ ] Confirm workbook has exactly 8 sheets with correct names
- [ ] Open xlsx, check Exec Summary tab shows snapshot date and non-zero KPIs
- [ ] Run `extract_sales_plan.py --region OR` and verify `or-sales-plan-data.json` is valid JSON
- [ ] Load `Everde_OR_Sales_Plan_Dashboard.html` locally (file://) — should show data, not blocked panel
- [ ] Deploy HTML to portal route `/sales-plan/or-sales-plan`
- [ ] Confirm sidebar nav item "OR Forward Looking YTD Miss vs Inventory" links correctly

---

*Prepared by Claude (Anthropic) — Oregon Sales Plan package, May 2026.*
*Matches methodology, tab layout, and quality bar of CURSOR_HANDOFF_Sales_Plan_Review.md (NOR CAL).*
