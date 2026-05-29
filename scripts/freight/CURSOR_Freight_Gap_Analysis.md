# Everde Freight Dashboard — Gap Analysis & Cursor Implementation Guide
## Jonathan's May 28, 2026 Workbook vs Current Portal

**File reviewed:** `Everde_Freight_Dashboard_2026-05-28.xlsx`  
**Build date:** 2026-05-28 13:24  
**Source data:** Everde Freight Data YTD 5-23-26 (30,092 master rows, Dec 29 2025 → May 22 2026)  
**Portal:** https://everde-operations.vercel.app  

---

## SUMMARY: What Changed

Jonathan's May 28 workbook adds **3 new features** and **expands filters on 5 existing views**
that the portal dashboard does not yet reflect. Nothing is a breaking change — all additions
slot into the existing architecture.

| # | Area | Type | Priority |
|---|------|------|---------|
| 1 | Region Dashboards — Week filter added | Filter gap | 🔴 High |
| 2 | Region Dashboards — Sales Director filter added | Filter gap | 🔴 High |
| 3 | Top Opportunities — Week + Sales Director filters added | Filter gap | 🔴 High |
| 4 | Top Opportunities — Last Week tab | New tab | 🔴 High |
| 5 | Internal Freight Analysis tab | Entire new tab | 🟡 Medium |
| 6 | Sales Performance tab | Entire new tab | 🟡 Medium |
| 7 | Top Opportunities — prior-year site context columns added | Data columns | 🟡 Medium |
| 8 | BUD_MILE rates updated (5 sites changed) | Data / Reference | 🟢 Low |
| 9 | Build Health + Change Log tabs | Meta / audit | 🟢 Low |

---

## GAP 1 & 2 — Region Dashboard Filters: Week + Sales Director Missing

### What the workbook has (all 5 region tabs: N. CA, S. CA, TX, FL, FOR)

```
FILTERS:  Month | Customer Type | Ship Type | Trailer Type | Site | [NEW: Week] | [NEW: Sales Director]
```

### What the portal currently has

```
FILTERS:  Month | Customer Type | Ship Type | Trailer Type | Site
```

### Missing: two new filter dropdowns per region dashboard

**Week filter** — lets managers drill to a specific ISO week number (1–52).
Values in master data: integer week number (e.g. 19, 20, 21).

**Sales Director filter** — lets managers see performance for their book.
Values in master data: the `Sales Director` column (e.g. "MIDWEST", "WEST COAST", "SOUTHEAST TX", "SOUTHEAST FL").

### Cursor implementation

In the region dashboard component (all 5 regions share the same template), add two dropdowns alongside the existing filter row:

```jsx
// Add to region filter state
const [weekFilter, setWeekFilter] = useState('All');
const [directorFilter, setDirectorFilter] = useState('All');

// Dropdown options — derive from loaded JSON data
const weekOptions   = ['All', ...unique(data.loads.map(r => r.week)).sort((a,b)=>a-b)];
const directorOpts  = ['All', ...unique(data.loads.map(r => r.sales_director)).sort()];

// Filter row JSX — insert after existing Trailer Type dropdown
<FilterDropdown
  label="Week"
  value={weekFilter}
  options={weekOptions}
  onChange={setWeekFilter}
/>
<FilterDropdown
  label="Sales Director"
  value={directorFilter}
  options={directorOpts}
  onChange={setDirectorFilter}
/>
```

Apply in the filter predicate (same place Month/CustomerType/ShipType/TrailerType/Site are applied):
```javascript
&& (weekFilter    === 'All' || row.week           === weekFilter)
&& (directorFilter=== 'All' || row.sales_director === directorFilter)
```

**Data requirement:** `extract_data.py` (freight extractor) must include `week` and `sales_director` in the per-load JSON. Confirm both columns exist in `master_clean.pkl`:
- `week` = ISO week number (integer)
- `sales_director` = Sales Director string

---

## GAP 3 — Top Opportunities Filters: Week + Sales Director Missing

### What the workbook has (Top Opportunities tab)

```
ALL FLAGGED LOADS (3,184 loads)
Columns: Tracking # | Region | Site | Month | Week | Ship Type | Cust Type | Customer |
         Sales Rep | Sales Director | Freight Ring | Trailer | Size | Fill % | Drops |
         Orders | EUs | Miles | Revenue | Recovery | Cost | Net | Flag LowFill |
         Flag 3P | Flag Leak | Total Flags | Site '25 YTD Cost/Load |
         Site '25 YTD Recov % | Site '25 YTD Loads | This Load Cost/Load | Δ vs Site '25
```

### What the portal currently has

Top Opportunities filters: Region, Flag Type, Month, Site — **Week and Sales Director not present**.

### Missing columns in portal data

The workbook also added **5 prior-year site context columns** per load row that the portal does not render:

| Column | Description |
|--------|-------------|
| `Site '25 YTD Cost/Load` | The flagged load's site average cost/load in 2025 YTD |
| `Site '25 YTD Recov %` | The site's 2025 YTD recovery % |
| `Site '25 YTD Loads` | The site's 2025 YTD load count |
| `This Load Cost/Load` | Cost per load for this specific flagged load |
| `Δ vs Site '25` | This load's cost/load ÷ site 2025 avg — identifies chronic vs one-off |

These columns answer "Is this load an outlier or is the whole site struggling?" and are central to Jonathan's analysis workflow.

### Cursor implementation

**Filters to add** (same pattern as Region Dashboards above):
```jsx
// Add to Top Opportunities filter state
const [weekFilter,     setWeekFilter]     = useState('All');
const [directorFilter, setDirectorFilter] = useState('All');

// Filter row — add alongside existing Region/Site/Month/Flag dropdowns
<FilterDropdown label="Week"          value={weekFilter}     options={weekOpts}     onChange={setWeekFilter} />
<FilterDropdown label="Sales Director" value={directorFilter} options={directorOpts} onChange={setDirectorFilter} />
```

**New columns to render** in the Top Opportunities table:

```jsx
// Add these columns to the opportunities table header and row render
const extraCols = [
  { key: 'site_25_cost_per_load', label: "Site '25 Cost/Load",   fmt: fmtDollar },
  { key: 'site_25_recov_pct',     label: "Site '25 Recov %",     fmt: fmtPct    },
  { key: 'site_25_loads',         label: "Site '25 Loads",       fmt: fmtInt    },
  { key: 'this_load_cost_per_load',label:"This Load $/Load",     fmt: fmtDollar },
  { key: 'delta_vs_site_25',      label: "Δ vs Site '25",        fmt: fmtMultiplier,
    cellClass: v => v > 2 ? 'cell-red' : v > 1 ? 'cell-gold' : 'cell-green' },
];
```

**Data requirement:** `extract_data.py` must compute and include these 5 fields per flagged load.
They join from `_history` (aggregate tab in workbook) — site-level 2025 YTD figures.

```python
# In extract_data.py — compute site context for Top Opps
site_25 = master[(master.year == 2025)].groupby('site').agg(
    site_25_cost_per_load = ('cost', 'sum') / ('loads', 'sum'),  # adjust syntax
    site_25_recov_pct     = ('recovery', 'sum'),
    site_25_loads         = ('loads', 'count'),
).reset_index()

# Then join to flagged loads on 'site'
flagged = flagged.merge(site_25, on='site', how='left')
flagged['this_load_cost_per_load'] = flagged['cost'] / flagged['loads']
flagged['delta_vs_site_25'] = flagged['this_load_cost_per_load'] / flagged['site_25_cost_per_load']
```

---

## GAP 4 — "Top Opportunities — Last Week" Tab: Not in Portal

### What the workbook has

A separate tab `Top Opportunities — Last Week` showing only the most recent ship-date window:

```
TOP OPPORTUNITIES — LAST WEEK
Ship Date May 11 → May 22, 2026  •  692 loads in window  •  310 flagged

KPI banner:
  Flagged Loads | Total Cost | Total Net | Low Fill ($) | 3P/Int ($)

Table columns:
  Tracking # | Region | Site | Ship Date | Week | Ship Type | Cust Type |
  Customer | Sales Rep | Trailer | Drops | EUs | Fill % | Frt Cost |
  Recovery | Net Recovery | Low Fill ✓ | 3P/Int ✓ | Leak ✓ | Flags (count)
```

Key differences from the main Top Opportunities tab:
- Filtered to last ~2 weeks of ship dates automatically (current week + prior week)
- Shows `Ship Date` (specific date) instead of `Month`
- Multi-stop loads show rollup labels: "Multi-stop (N customers)", "Multi-stop (N reps)"
- Flag columns are ✓ / blank instead of 0/1
- Sorted by |Net Recovery| descending (biggest impact first regardless of sign)

### Cursor implementation

Add a new sub-tab or separate route: `/load-board-freight/everde-freight-dashboard/last-week`

Or implement as a tab toggle within the existing Top Opportunities view:

```jsx
// Tab switcher at top of Top Opportunities page
const [oppView, setOppView] = useState('all');  // 'all' | 'last-week'

<TabBar>
  <Tab active={oppView==='all'}       onClick={() => setOppView('all')}>
    All Flagged ({data.opps_all.length} loads)
  </Tab>
  <Tab active={oppView==='last-week'} onClick={() => setOppView('last-week')} highlight="red">
    Last Week ({data.opps_last_week.length} loads)
  </Tab>
</TabBar>
```

**KPI banner** (4 cards, shown only in Last Week view):
```jsx
<KpiBanner>
  <KpiCard label="Flagged Loads"  value={d.flagged_count} />
  <KpiCard label="Total Cost"     value={fmtDollar(d.total_cost)} />
  <KpiCard label="Total Net"      value={fmtDollar(d.total_net)} color="red" />
  <KpiCard label="Low Fill ($)"   value={fmtDollar(d.low_fill_cost)} />
  <KpiCard label="3P/Int ($)"     value={fmtDollar(d.threep_int_cost)} />
</KpiBanner>
```

**Data requirement:** `extract_data.py` must produce two separate arrays in the JSON:
```python
# In extract_data.py
last_ship_date = master_2026['ship_date'].max()
last_week_start = last_ship_date - timedelta(days=13)  # ~2 weeks back

opps_last_week = flagged_2026[flagged_2026['ship_date'] >= last_week_start].copy()
opps_last_week['ship_date_str'] = opps_last_week['ship_date'].dt.strftime('%m/%d/%Y')

# Multi-stop rollup labels
def rollup_label(values, noun):
    unique_vals = values.dropna().unique()
    return unique_vals[0] if len(unique_vals) == 1 else f"Multi-stop ({len(unique_vals)} {noun})"

opps_last_week['customer_display'] = opps_last_week.groupby('tracking')['customer'].transform(
    lambda x: rollup_label(x, 'customers'))
opps_last_week['rep_display'] = opps_last_week.groupby('tracking')['sales_rep'].transform(
    lambda x: rollup_label(x, 'reps'))

output['opps_last_week'] = opps_last_week.to_dict('records')
output['opps_last_week_meta'] = {
    'ship_date_start': last_week_start.strftime('%b %d'),
    'ship_date_end':   last_ship_date.strftime('%b %d, %Y'),
    'total_loads_in_window': len(master_2026[master_2026['ship_date'] >= last_week_start]),
    'flagged_count':   len(opps_last_week),
    'total_cost':      float(opps_last_week['cost'].sum()),
    'total_net':       float(opps_last_week['net'].sum()),
    'low_fill_cost':   float(opps_last_week[opps_last_week['flag_low_fill']==1]['cost'].sum()),
    'threep_int_cost': float(opps_last_week[opps_last_week['flag_3p']==1]['cost'].sum()),
}
```

---

## GAP 5 — Internal Freight Analysis Tab: Not in Portal

### What the workbook has

A dedicated tab analyzing **why internal freight costs are high**, with:

**Primary filters:** Year | Month | Region | Trailer Type | Site | Customer Type  
**Compare filters:** Compare Year | Compare Month | Compare Region

**4 sections:**
1. **5-Year Trend** — Internal only: Loads, Drops, EUs, Miles, Cost, $/Mile, Cost/EU, EUs/Load + Diesel $/gal (US National YTD)
2. **By Region** — Primary | Compare | Δ side-by-side (same metrics + Δ Loads %, Δ Cost %, Δ $/Mile %, Δ Diesel %)
3. **By Trailer Type** — Primary | Compare | Δ (all trailer types: BP, CPU, DD, FB, PU, R, ST, V, VSA, VSB)
4. **Top 30 Internal Lanes** — 5-year cost history per Site × Freight Ring: '22–'26 Cost + Loads, plus '26 EUs/Miles/$/Mile/Cost/EU/'25→'26 Cost%/'22→'26 Cost%

### Cursor implementation

Add route: `/load-board-freight/everde-freight-dashboard/internal-freight`

Or add as a new sidebar nav item "Internal Freight" (same level as 3rd Party Analysis).

```jsx
// Component: InternalFreightAnalysis
// Props: data (from freight JSON), same filter hooks pattern as 3rd Party Analysis

const filters = {
  year, month, region, trailerType, site, customerType,   // primary
  compareYear, compareMonth, compareRegion,               // compare
};

// Sections
<Section5YrTrend   data={d.internal_5yr}       />
<SectionByRegion   data={d.internal_by_region} filters={filters} />
<SectionByTrailer  data={d.internal_by_trailer} filters={filters} />
<SectionTopLanes   data={d.internal_top_lanes} />
```

**Data requirement:** `extract_data.py` must add internal freight aggregates:
```python
internal = master[master['ship_type'] == 'INTERNAL FREIGHT']

output['internal_5yr'] = internal.groupby('year').agg(
    loads=('tracking','nunique'), drops=('drop_id','count'),
    eus=('eus','sum'), miles=('miles','sum'), cost=('cost','sum'),
).assign(
    cost_per_mile = lambda x: x.cost / x.miles,
    cost_per_eu   = lambda x: x.cost / x.eus,
    eus_per_load  = lambda x: x.eus  / x.loads,
).to_dict('records')

output['internal_top_lanes'] = (
    internal[internal.year == 2026]
    .groupby(['site','freight_ring'])
    .agg(cost=('cost','sum'), loads=('tracking','nunique'),
         eus=('eus','sum'), miles=('miles','sum'))
    .nlargest(30, 'cost')
    .reset_index()
    .to_dict('records')
)
```

---

## GAP 6 — Sales Performance Tab: Not in Portal

### What the workbook has

A tab showing freight economics **by Sales Rep and Channel**, answering "which rep is losing freight money?"

**Filters:** Year | Month | Channel | Region

**2 sections:**
1. **By Channel** — Home Depot | Lowe's | Wholesale: Loads, Drops, EUs, Revenue, Recovery, Cost, Net, Recov%, $/EU, Frt%Rev
2. **By Effective Rep** — full rep list sorted by Net Recovery, with same metrics. HD and Lowe's collapsed into channel rows; all others show actual rep name.

### Cursor implementation

Add as sidebar nav item "Sales Performance" or as a sub-tab of the Exec Summary.

```jsx
// Component: SalesPerformance
// Filters: year, month, channel ('All'|'Home Depot'|"Lowe's"|'Wholesale'), region

<FilterRow>
  <Dropdown label="Year"    options={yearOpts}    value={year}    onChange={setYear}    />
  <Dropdown label="Month"   options={monthOpts}   value={month}   onChange={setMonth}   />
  <Dropdown label="Channel" options={channelOpts} value={channel} onChange={setChannel} />
  <Dropdown label="Region"  options={regionOpts}  value={region}  onChange={setRegion}  />
</FilterRow>

<DataTable
  title="By Channel"
  data={filteredByChannel}
  cols={['channel','loads','drops','eus','revenue','recovery','cost','net','recov_pct','cost_per_eu','frt_pct_rev']}
/>
<DataTable
  title="By Rep (sorted by Net Recovery)"
  data={filteredByRep.sort((a,b) => a.net - b.net)}
  cols={['rep','channel','loads','drops','eus','revenue','recovery','cost','net','recov_pct','cost_per_eu','frt_pct_rev']}
/>
```

**Data requirement:**
```python
# In extract_data.py
def effective_rep(row):
    if 'HOME DEPOT' in str(row['customer']).upper():  return 'Home Depot'
    if "LOWE'S" in str(row['customer']).upper():      return "Lowe's"
    return row['sales_rep']

master['effective_rep'] = master.apply(effective_rep, axis=1)
master['channel'] = master['effective_rep'].map(
    lambda r: 'Home Depot' if r == 'Home Depot'
              else ("Lowe's" if r == "Lowe's" else 'Wholesale'))

output['sales_by_channel'] = master.groupby('channel').agg(...).to_dict('records')
output['sales_by_rep'] = (
    master.groupby(['effective_rep','channel'])
    .agg(loads=('tracking','nunique'), drops=('drop_id','count'),
         eus=('eus','sum'), revenue=('revenue','sum'),
         recovery=('recovery','sum'), cost=('cost','sum'),
         net=('net','sum'))
    .assign(recov_pct=lambda x: x.recovery/x.revenue,
            cost_per_eu=lambda x: x.cost/x.eus,
            frt_pct_rev=lambda x: x.cost/x.revenue)
    .reset_index().to_dict('records')
)
```

---

## GAP 7 (minor) — BUD_MILE Rates Updated in Reference Tab

The workbook updated internal $/Mile budget rates for 5 sites. The portal Reference tab / rate cards need updating:

| Site | Old Rate | New Rate |
|------|---------|---------|
| WIN  | — | **$7.56** |
| BRA  | $2.54 | **$7.56** |
| STE  | $8.477 | **$7.66** |
| FAL  | $8.049 | **$7.66** |
| PIR  | $4.002 | **$3.64** |
| GFL  | — | **$5.00** |
| MCR  | — | **$3.70** |
| BNL  | — | **$1.08** |

In `extract_data.py`, update the `BUD_MILE` dict:
```python
BUD_MILE = {
    'BNL': 1.08,
    'BRA': 7.56,
    'FAL': 7.66,
    'GFL': 5.00,
    'MCR': 3.70,
    'PIR': 3.64,
    'STE': 7.66,
    'WIN': 7.56,
    # FOR region sites use actual (not budget)
    'ESC': None, 'FOR': None, 'HOM': None, 'HUN': None, 'MLC': None, 'OAS': None, 'PAU': None,
}
```

---

## Implementation Order (Recommended)

Do these in sequence so each change is testable:

**Sprint 1 — Filter gaps (1-2 hours)**
1. Add `week` and `sales_director` fields to `extract_data.py` output (confirm they're in master_clean.pkl first)
2. Add Week + Sales Director dropdowns to all 5 Region Dashboard components
3. Add Week + Sales Director dropdowns to Top Opportunities component
4. Update BUD_MILE rates in `extract_data.py` and Reference display

**Sprint 2 — Top Opps enhancements (2-3 hours)**
5. Add 5 prior-year site context columns to Top Opportunities table and extractor
6. Add Last Week tab/toggle to Top Opportunities (new data key in JSON + new view component)

**Sprint 3 — New tabs (3-5 hours)**
7. Internal Freight Analysis tab + extractor additions
8. Sales Performance tab + extractor additions

---

## JSON Schema Changes Summary

All changes are **additive** — no existing keys are removed or renamed.

```
freight_data.json additions:
├── loads[*].week                          (int) NEW
├── loads[*].sales_director                (str) NEW
├── opps[*].site_25_cost_per_load          (float) NEW
├── opps[*].site_25_recov_pct              (float) NEW
├── opps[*].site_25_loads                  (int) NEW
├── opps[*].this_load_cost_per_load        (float) NEW
├── opps[*].delta_vs_site_25               (float) NEW
├── opps_last_week                         (array) NEW
├── opps_last_week_meta                    (object) NEW
├── internal_5yr                           (array) NEW
├── internal_by_region                     (array) NEW
├── internal_by_trailer                    (array) NEW
├── internal_top_lanes                     (array) NEW
├── sales_by_channel                       (array) NEW
└── sales_by_rep                           (array) NEW
```

---

## Files to Modify

| File | Change |
|------|--------|
| `extract_data.py` (or freight extractor) | Add week, sales_director, site context cols, last-week opps, internal agg, sales agg, BUD_MILE update |
| Region Dashboard component (all 5 regions) | +2 filter dropdowns (Week, Sales Director) |
| Top Opportunities component | +2 filter dropdowns + 5 new table columns + Last Week toggle |
| Sidebar nav | Add "Internal Freight" and "Sales Performance" nav items |
| New: `InternalFreightAnalysis` component | 4-section layout per spec above |
| New: `SalesPerformance` component | 2-section layout per spec above |

---

*Gap analysis prepared by Claude (Anthropic) from Jonathan's Everde_Freight_Dashboard_2026-05-28.xlsx.*  
*Build Health tab confirms: pipeline step 28, verify gate PASSED ✓, all 4 checks.*
