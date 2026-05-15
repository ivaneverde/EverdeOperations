"""
extract_data.py
---------------
Everde Growers — Freight Dashboard Data Extractor
Reads the weekly XLSB/XLSX upload, computes all dashboard metrics,
and outputs dashboard_data.json for the web portal.

Usage:
    python extract_data.py <input_file.xlsb> [output_path.json]

Dependencies:
    pip install pandas openpyxl pyxlsb
"""

import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

YTD_MONTHS = ['01-JAN', '02-FEB', '03-MAR', '04-APR']
YEARS = [2022, 2023, 2024, 2025, 2026]
REGIONS = ['N. CA', 'S. CA', 'TX', 'FL', 'FOR']
MONTH_KEYS = [
    '01-JAN', '02-FEB', '03-MAR', '04-APR', '05-MAY', '06-JUN',
    '07-JUL', '08-AUG', '09-SEP', '10-OCT', '11-NOV', '12-DEC'
]
REGION_SITES = {
    'N. CA': ['WIN', 'BRA'],
    'S. CA': ['STE', 'FAL', 'PIR', 'MLC', 'ESC', 'PAU', 'HUN'],
    'TX':    ['MCR', 'OAS', 'GFL'],
    'FL':    ['BNL', 'HOM'],
    'FOR':   ['FOR'],
}

BACKEND_TABS = [
    '_history', '_explorer', '_trailer_history',
    '_3p_explorer', '_3p_carrier', '_3p_lane',
    '_rep_history', '_lane_history', '_cust_history',
    '_sd_history', '_diesel',
]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def safe_div(a, b, decimals=4):
    try:
        if b and not np.isnan(float(b)) and float(b) != 0:
            return round(float(a) / float(b), decimals)
    except Exception:
        pass
    return 0


def ytd_filter(df, year, months=None):
    if months is None:
        months = YTD_MONTHS
    return df[(df['Year'] == year) & (df['Month'].isin(months))]


def kpi_row(df, year, months=None):
    d = ytd_filter(df, year, months)
    loads    = d['Loads'].sum()
    drops    = d['Drops'].sum()
    eus      = d['EUs'].sum()
    miles    = d['Miles'].sum()
    revenue  = d['Revenue'].sum()
    recovery = d['Recovery'].sum()
    cost     = d['Cost'].sum()
    net      = d['Net'].sum()
    return {
        'loads':          round(loads),
        'drops':          round(drops),
        'eus':            round(eus),
        'miles':          round(miles, 1),
        'revenue':        round(revenue, 2),
        'recovery':       round(recovery, 2),
        'cost':           round(cost, 2),
        'net':            round(net, 2),
        'recov_pct':      safe_div(recovery, revenue),
        'cost_pct':       safe_div(cost, revenue),
        'cost_per_eu':    safe_div(cost, eus),
        'cost_per_mile':  safe_div(cost, miles),
        'cost_per_load':  safe_div(cost, loads),
        'cost_per_drop':  safe_div(cost, drops),
    }


def load_file(path):
    """Load XLSB or XLSX and return ExcelFile object."""
    p = Path(path)
    suffix = p.suffix.lower()
    if suffix == '.xlsb':
        return pd.ExcelFile(path, engine='pyxlsb')
    elif suffix in ('.xlsx', '.xlsm', '.xls'):
        return pd.ExcelFile(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


# ─────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────

def extract(file_path, output_path=None):
    print(f"Loading: {file_path}", flush=True)
    print("Opening workbook (large .xlsb can take several minutes)…", flush=True)
    xl = load_file(file_path)

    # ── Load backend tabs ──
    print("Parsing backend sheets…", flush=True)
    hist     = xl.parse('_history')
    exp      = xl.parse('_explorer')
    tp_exp   = xl.parse('_3p_explorer')
    tp_car   = xl.parse('_3p_carrier')
    tp_lane  = xl.parse('_3p_lane')
    rep_hist = xl.parse('_rep_history')
    lane_hist= xl.parse('_lane_history')
    cust_hist= xl.parse('_cust_history')
    sd_hist  = xl.parse('_sd_history')
    diesel_df= xl.parse('_diesel')

    print(f"  _history: {len(hist):,} rows", flush=True)
    print(f"  _explorer: {len(exp):,} rows", flush=True)

    # ── Detect YTD months dynamically ──
    # Use whatever months exist for 2026 (current year)
    months_2026 = hist[hist['Year'] == 2026]['Month'].dropna().unique().tolist()
    ytd_months = sorted(months_2026) if months_2026 else YTD_MONTHS
    print(f"  YTD months detected: {ytd_months}", flush=True)

    # ── Detect all years ──
    all_years = sorted(hist['Year'].dropna().unique().astype(int).tolist())
    print(f"  Years detected: {all_years}", flush=True)

    # Helper that uses dynamic ytd_months
    def ytd(df, year):
        return ytd_filter(df, year, ytd_months)

    def kpi(df, year):
        return kpi_row(df, year, ytd_months)


    # ══════════════════════════════════════════
    # 1. COMPANY KPIs (YTD per year)
    # ══════════════════════════════════════════
    company_kpis = {str(y): kpi(hist, y) for y in all_years}


    # ══════════════════════════════════════════
    # 2. REGION KPIs (YTD per region per year)
    # ══════════════════════════════════════════
    region_kpis = {}
    for region in REGIONS:
        region_kpis[region] = {}
        for yr in all_years:
            d = ytd(hist, yr)
            dr = d[d['Region'] == region]
            region_kpis[region][str(yr)] = kpi_row(dr, yr, ytd_months) if len(dr) == 0 else {
                'loads':         round(dr['Loads'].sum()),
                'drops':         round(dr['Drops'].sum()),
                'eus':           round(dr['EUs'].sum()),
                'miles':         round(dr['Miles'].sum(), 1),
                'revenue':       round(dr['Revenue'].sum(), 2),
                'recovery':      round(dr['Recovery'].sum(), 2),
                'cost':          round(dr['Cost'].sum(), 2),
                'net':           round(dr['Net'].sum(), 2),
                'recov_pct':     safe_div(dr['Recovery'].sum(), dr['Revenue'].sum()),
                'cost_per_eu':   safe_div(dr['Cost'].sum(), dr['EUs'].sum()),
                'cost_per_mile': safe_div(dr['Cost'].sum(), dr['Miles'].sum()),
                'cost_per_load': safe_div(dr['Cost'].sum(), dr['Loads'].sum()),
                'cost_per_drop': safe_div(dr['Cost'].sum(), dr['Drops'].sum()),
            }


    # ══════════════════════════════════════════
    # 3. SITE KPIs (YTD per site per year)
    # ══════════════════════════════════════════
    all_sites = sorted(hist['Site'].dropna().unique().tolist())
    site_kpis = {}
    for site in all_sites:
        site_kpis[site] = {}
        for yr in all_years:
            d = ytd(hist, yr)
            ds = d[d['Site'] == site]
            site_kpis[site][str(yr)] = {
                'loads':         round(ds['Loads'].sum()),
                'drops':         round(ds['Drops'].sum()),
                'eus':           round(ds['EUs'].sum()),
                'miles':         round(ds['Miles'].sum(), 1),
                'revenue':       round(ds['Revenue'].sum(), 2),
                'recovery':      round(ds['Recovery'].sum(), 2),
                'cost':          round(ds['Cost'].sum(), 2),
                'net':           round(ds['Net'].sum(), 2),
                'recov_pct':     safe_div(ds['Recovery'].sum(), ds['Revenue'].sum()),
                'cost_per_eu':   safe_div(ds['Cost'].sum(), ds['EUs'].sum()),
                'cost_per_mile': safe_div(ds['Cost'].sum(), ds['Miles'].sum()),
                'cost_per_load': safe_div(ds['Cost'].sum(), ds['Loads'].sum()),
                'cost_per_drop': safe_div(ds['Cost'].sum(), ds['Drops'].sum()),
            }


    # ══════════════════════════════════════════
    # 4. MONTHLY TRENDS
    # ══════════════════════════════════════════
    monthly_company = {}
    for yr in all_years:
        monthly_company[str(yr)] = {}
        for mo in MONTH_KEYS:
            d = hist[(hist['Year'] == yr) & (hist['Month'] == mo)]
            monthly_company[str(yr)][mo] = {
                'loads':   round(d['Loads'].sum()),
                'revenue': round(d['Revenue'].sum(), 2),
                'cost':    round(d['Cost'].sum(), 2),
                'net':     round(d['Net'].sum(), 2),
                'eus':     round(d['EUs'].sum()),
                'miles':   round(d['Miles'].sum(), 1),
            }

    monthly_region = {}
    for region in REGIONS:
        monthly_region[region] = {}
        for yr in all_years:
            monthly_region[region][str(yr)] = {}
            for mo in MONTH_KEYS:
                d = hist[(hist['Year'] == yr) & (hist['Month'] == mo) & (hist['Region'] == region)]
                monthly_region[region][str(yr)][mo] = {
                    'loads':   round(d['Loads'].sum()),
                    'revenue': round(d['Revenue'].sum(), 2),
                    'cost':    round(d['Cost'].sum(), 2),
                    'net':     round(d['Net'].sum(), 2),
                }


    # ══════════════════════════════════════════
    # 5. 3P ANALYSIS
    # ══════════════════════════════════════════
    tp_by_year = {}
    for yr in all_years:
        d = tp_exp[(tp_exp['Year'] == yr) & (tp_exp['Month'].isin(ytd_months))]
        miles = d['Miles'].sum()
        cost  = d['Cost'].sum()
        tp_by_year[str(yr)] = {
            'loads':         round(d['Loads'].sum()),
            'miles':         round(miles, 1),
            'cost':          round(cost, 2),
            'revenue':       round(d['Revenue'].sum(), 2),
            'cost_per_mile': safe_div(cost, miles),
        }

    tp_region = {}
    for region in REGIONS:
        tp_region[region] = {}
        for yr in all_years:
            d = tp_exp[
                (tp_exp['Year'] == yr) &
                (tp_exp['Region'] == region) &
                (tp_exp['Month'].isin(ytd_months))
            ]
            miles = d['Miles'].sum()
            cost  = d['Cost'].sum()
            tp_region[region][str(yr)] = {
                'loads':         round(d['Loads'].sum()),
                'miles':         round(miles, 1),
                'cost':          round(cost, 2),
                'cost_per_mile': safe_div(cost, miles),
            }

    top_carriers = {}
    for yr in all_years:
        dc = tp_car[tp_car['Year'] == yr].copy()
        dc = dc.sort_values('Cost', ascending=False).head(15)
        dc['cost_per_mile'] = dc.apply(
            lambda r: safe_div(r['Cost'], r['Miles']), axis=1)
        top_carriers[str(yr)] = dc[
            ['Carrier', 'Loads', 'Miles', 'Revenue', 'Cost', 'cost_per_mile']
        ].to_dict('records')

    top_lanes = {}
    for yr in all_years:
        dl = tp_lane[tp_lane['Year'] == yr].copy()
        dl = dl.sort_values('Cost', ascending=False).head(15)
        dl['cost_per_mile'] = dl.apply(
            lambda r: safe_div(r['Cost'], r['Miles']), axis=1)
        top_lanes[str(yr)] = dl[
            ['Region', 'Site', 'Freight Ring', 'Trailer Type',
             'Loads', 'Miles', 'Revenue', 'Cost', 'cost_per_mile']
        ].to_dict('records')


    # ══════════════════════════════════════════
    # 6. LANE RECOVERY
    # ══════════════════════════════════════════
    lane_ytd = {}
    for yr in all_years:
        d = lane_hist[
            (lane_hist['Year'] == yr) &
            (lane_hist['Month'].isin(ytd_months))
        ]
        grp = d.groupby(['Region', 'Site', 'Freight Ring'])[
            ['Loads', 'Revenue', 'Recovery', 'Cost', 'Net']
        ].sum().reset_index()
        grp['recov_pct'] = grp.apply(
            lambda r: safe_div(r['Recovery'], r['Revenue']), axis=1)
        grp['cost_pct'] = grp.apply(
            lambda r: safe_div(r['Cost'], r['Revenue']), axis=1)
        lane_ytd[str(yr)] = (
            grp.sort_values('Cost', ascending=False)
               .head(30)
               .to_dict('records')
        )


    # ══════════════════════════════════════════
    # 7. SALES PERFORMANCE
    # ══════════════════════════════════════════
    rep_ytd = {}
    for yr in all_years:
        d = rep_hist[
            (rep_hist['Year'] == yr) &
            (rep_hist['Month'].isin(ytd_months))
        ]
        grp = d.groupby(['Effective Rep', 'Sales Director'])[
            ['Loads', 'Revenue', 'Recovery', 'Cost', 'Net']
        ].sum().reset_index()
        grp['recov_pct'] = grp.apply(
            lambda r: safe_div(r['Recovery'], r['Revenue']), axis=1)
        rep_ytd[str(yr)] = (
            grp.sort_values('Revenue', ascending=False)
               .head(20)
               .to_dict('records')
        )

    sd_ytd = {}
    for yr in all_years:
        d = sd_hist[sd_hist['Year'] == yr]
        sd_ytd[str(yr)] = d[
            ['Sales Director', 'Loads', 'Revenue', 'Recovery', 'Cost', 'Net']
        ].to_dict('records')

    channel_ytd = {}
    for yr in all_years:
        d = rep_hist[
            (rep_hist['Year'] == yr) &
            (rep_hist['Month'].isin(ytd_months))
        ]
        grp = d.groupby('Channel')[
            ['Loads', 'Revenue', 'Recovery', 'Cost', 'Net']
        ].sum().reset_index()
        channel_ytd[str(yr)] = grp.to_dict('records')


    # ══════════════════════════════════════════
    # 8. CUSTOMER HISTORY
    # ══════════════════════════════════════════
    cust_ytd = {}
    cust_pivot = {}
    for yr in all_years:
        d = cust_hist[cust_hist['Year'] == yr].sort_values('Revenue', ascending=False)
        cust_ytd[str(yr)]   = d.head(30).to_dict('records')
        cust_pivot[str(yr)] = d.to_dict('records')


    # ══════════════════════════════════════════
    # 9. TRAILER ANALYSIS
    # ══════════════════════════════════════════
    trailer_ytd = {}
    for yr in all_years:
        d = exp[(exp['Year'] == yr) & (exp['Month'].isin(ytd_months))]
        grp = d.groupby('Trailer Type')[
            ['Loads', 'Drops', 'EUs', 'Miles', 'Revenue', 'Cost']
        ].sum().reset_index()
        grp['cost_per_mile'] = grp.apply(
            lambda r: safe_div(r['Cost'], r['Miles']), axis=1)
        grp['cost_per_eu'] = grp.apply(
            lambda r: safe_div(r['Cost'], r['EUs']), axis=1)
        trailer_ytd[str(yr)] = grp.to_dict('records')

    # Pivot versions
    pivot_trailer   = trailer_ytd
    pivot_cust_type = {}
    pivot_ship      = {}
    for yr in all_years:
        d = hist[(hist['Year'] == yr) & (hist['Month'].isin(ytd_months))]
        grp_ct = d.groupby('Cust Type')[
            ['Loads', 'Revenue', 'Cost', 'Net', 'EUs']
        ].sum().reset_index()
        pivot_cust_type[str(yr)] = grp_ct.to_dict('records')

        grp_st = d.groupby('Ship Type')[
            ['Loads', 'Revenue', 'Cost', 'Net', 'EUs', 'Miles']
        ].sum().reset_index()
        pivot_ship[str(yr)] = grp_st.to_dict('records')


    # ══════════════════════════════════════════
    # 10. DIESEL
    # ══════════════════════════════════════════
    diesel_data = diesel_df.to_dict('records')


    # ══════════════════════════════════════════
    # 11. VARIANCE DRIVERS
    # ══════════════════════════════════════════
    variance = {}
    for i, yr in enumerate(all_years):
        if i == 0:
            continue
        prev = all_years[i - 1]
        curr_d = ytd(hist, yr)
        prev_d = ytd(hist, prev)

        curr_loads = curr_d['Loads'].sum()
        prev_loads = prev_d['Loads'].sum()
        curr_miles = curr_d['Miles'].sum()
        prev_miles = prev_d['Miles'].sum()
        curr_cost  = curr_d['Cost'].sum()
        prev_cost  = prev_d['Cost'].sum()

        curr_mpl = safe_div(curr_miles, curr_loads)
        prev_mpl = safe_div(prev_miles, prev_loads)
        curr_cpm = safe_div(curr_cost, curr_miles)
        prev_cpm = safe_div(prev_cost, prev_miles)

        variance[f"{prev}_to_{yr}"] = {
            'volume_effect':   round((curr_loads - prev_loads) * prev_mpl * prev_cpm, 2),
            'distance_effect': round(prev_loads * (curr_mpl - prev_mpl) * prev_cpm, 2),
            'rate_effect':     round(prev_loads * prev_mpl * (curr_cpm - prev_cpm), 2),
            'total_change':    round(curr_cost - prev_cost, 2),
            'prev_cost':       round(prev_cost, 2),
            'curr_cost':       round(curr_cost, 2),
        }


    # ══════════════════════════════════════════
    # 12. TOP OPPORTUNITIES
    # ══════════════════════════════════════════
    recent_years = all_years[-2:]  # last 2 years
    exp_opp = exp[
        (exp['Month'].isin(ytd_months)) &
        (exp['Year'].isin(recent_years))
    ].copy()
    opp = exp_opp[
        (exp_opp['Cap'] < 0.8) &
        (exp_opp['Trailer Type'] != 'CPU')
    ].copy()
    opp['cost_per_mile'] = opp.apply(
        lambda r: safe_div(r['Cost'], r['Miles']), axis=1)
    opp['fill_rate'] = opp['Cap']
    top_opps = (
        opp.sort_values('Cost', ascending=False)
           .head(50)[['Year', 'Region', 'Site', 'Month', 'Trailer Type',
                       'Cust Type', 'Loads', 'EUs', 'Miles',
                       'Revenue', 'Cost', 'Net', 'fill_rate']]
           .to_dict('records')
    )


    # ══════════════════════════════════════════
    # ASSEMBLE & OUTPUT
    # ══════════════════════════════════════════
    result = {
        # Meta
        'meta': {
            'years':      [str(y) for y in all_years],
            'ytd_months': ytd_months,
            'regions':    REGIONS,
            'sites':      all_sites,
        },
        # Core metrics
        'company_kpis':   company_kpis,
        'region_kpis':    region_kpis,
        'site_kpis':      site_kpis,
        # Trends
        'monthly_company': monthly_company,
        'monthly_region':  monthly_region,
        # 3P
        'tp_by_year':   tp_by_year,
        'tp_region':    tp_region,
        'top_carriers': top_carriers,
        'top_lanes':    top_lanes,
        # Lane
        'lane_ytd': lane_ytd,
        # Sales
        'rep_ytd':      rep_ytd,
        'sd_ytd':       sd_ytd,
        'channel_ytd':  channel_ytd,
        # Customers
        'cust_ytd':   cust_ytd,
        'cust_pivot': cust_pivot,
        # Trailer / pivot
        'trailer_ytd':    trailer_ytd,
        'pivot_trailer':  pivot_trailer,
        'pivot_cust_type': pivot_cust_type,
        'pivot_ship':     pivot_ship,
        # Other
        'diesel':       diesel_data,
        'variance':     variance,
        'top_opps':     top_opps,
        'region_sites': REGION_SITES,
    }

    # Determine output path
    if output_path is None:
        output_path = Path(file_path).with_name('dashboard_data.json')

    with open(output_path, 'w') as f:
        json.dump(result, f, default=str)

    size_kb = Path(output_path).stat().st_size / 1024
    print(f"Output: {output_path} ({size_kb:.1f} KB)", flush=True)
    return str(output_path)


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python extract_data.py <input_file.xlsb|xlsx> [output.json]", flush=True)
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    extract(input_file, output_file)
