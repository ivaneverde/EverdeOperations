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

import math
import re
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime, timezone
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
MONTH_KEY_TO_LABEL = {
    '01-JAN': 'January', '02-FEB': 'February', '03-MAR': 'March',
    '04-APR': 'April', '05-MAY': 'May', '06-JUN': 'June',
    '07-JUL': 'July', '08-AUG': 'August', '09-SEP': 'September',
    '10-OCT': 'October', '11-NOV': 'November', '12-DEC': 'December',
}
MONTH_KEY_TO_SHORT = {
    '01-JAN': 'Jan', '02-FEB': 'Feb', '03-MAR': 'Mar', '04-APR': 'Apr',
    '05-MAY': 'May', '06-JUN': 'Jun', '07-JUL': 'Jul', '08-AUG': 'Aug',
    '09-SEP': 'Sep', '10-OCT': 'Oct', '11-NOV': 'Nov', '12-DEC': 'Dec',
}
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

# Budget $/Mile by site (Jonathan May 28, 2026 workbook — Reference tab)
BUD_MILE = {
    'BNL': 1.08,
    'BRA': 7.56,
    'FAL': 7.66,
    'GFL': 5.00,
    'MCR': 3.70,
    'PIR': 3.64,
    'STE': 7.66,
    'WIN': 7.56,
}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def sanitize_for_json(obj):
    """Replace NaN/Inf and pandas NA so output is valid RFC 8259 JSON (JavaScript JSON.parse)."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, tuple):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        x = float(obj)
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    if obj is None or isinstance(obj, (str, bool)):
        return obj
    if isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    try:
        if pd.isna(obj) and not isinstance(obj, (list, dict)):
            return None
    except (ValueError, TypeError):
        pass
    return obj


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


def parse_workbook_as_of(path: Path):
    """Parse date from ``…2026-05-28…`` or ``…YTD 5-27-26…`` workbook filenames."""
    iso = re.search(r'(\d{4})-(\d{2})-(\d{2})', path.name)
    if iso:
        yr, mo, day = int(iso.group(1)), int(iso.group(2)), int(iso.group(3))
    else:
        m = re.search(r'(\d{1,2})-(\d{1,2})-(\d{2,4})', path.name)
        if not m:
            return None, None
        mo, day, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yr < 100:
            yr += 2000
    try:
        dt = datetime(yr, mo, day)
    except ValueError:
        return None, None
    return dt.strftime('%Y-%m-%d'), f'{dt.strftime("%B")} {day}, {yr}'


def build_freight_meta(all_years, ytd_months, file_path, all_sites):
    """Labels for HTML cover/sidebar; derived from detected YTD months and workbook name."""
    years = [int(y) for y in all_years] if all_years else list(YEARS)
    years_str = f'{min(years)}-{max(years)}' if years else '2022-2026'
    current_year = max(years) if years else 2026

    months = ytd_months or YTD_MONTHS
    last_mk = months[-1]
    first_mk = months[0]
    last_short = MONTH_KEY_TO_SHORT.get(last_mk, last_mk)
    through_label = f'{MONTH_KEY_TO_LABEL.get(last_mk, last_short)} {current_year}'

    as_of_iso, as_of_label = parse_workbook_as_of(Path(file_path))
    subtitle = f'5-Year History ({years_str}) · YTD through {through_label}'
    if as_of_label:
        subtitle += f' · Updated {as_of_label}'

    return {
        'years': [str(y) for y in years],
        'ytd_months': months,
        'ytd_through_label': through_label,
        'years_range': years_str,
        'ytd_subtitle': subtitle,
        'sidebar_badge': f'YTD {last_short.upper()} {current_year}',
        'source_workbook': Path(file_path).name,
        'workbook_as_of': as_of_iso,
        'workbook_as_of_label': as_of_label,
        'extracted_at': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'regions': REGIONS,
        'sites': all_sites,
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


def _record_from_row(row):
    rec = {}
    for k, v in row.items():
        key = str(k).strip()
        if pd.isna(v):
            rec[key] = None
        elif isinstance(v, (np.integer,)):
            rec[key] = int(v)
        elif isinstance(v, (np.floating, float)):
            x = float(v)
            rec[key] = None if math.isnan(x) or math.isinf(x) else x
        elif hasattr(v, 'isoformat'):
            rec[key] = v.strftime('%Y-%m-%d')
        else:
            rec[key] = v
    return rec


def _records_from_df(df):
    df = df.dropna(how='all')
    return [_record_from_row(r) for _, r in df.iterrows()]


def parse_reference_bud_mile(wb_path):
    """Parse budget $/mile from Reference tab when present (Jonathan May 2026 workbook)."""
    p = Path(wb_path)
    try:
        xl = pd.ExcelFile(p)
    except Exception:
        return None
    if 'Reference' not in xl.sheet_names:
        return None
    raw = pd.read_excel(p, 'Reference', header=None)
    out = {}
    for _, row in raw.iterrows():
        vals = [x for x in row.values if pd.notna(x)]
        if len(vals) != 2:
            continue
        site, rate = vals[0], vals[1]
        site_s = str(site).strip().upper()
        if len(site_s) <= 4 and site_s.isalpha() and isinstance(rate, (int, float)):
            out[site_s] = round(float(rate), 4)
    return out or None


def parse_workbook_opportunities(wb_path):
    """
    Load-level flagged loads from visible Top Opportunities tabs
    (Everde_Freight_Dashboard_2026-05-28.xlsx and later).
    Returns None when sheet layout is absent (legacy rebuilt workbook).
    """
    p = Path(wb_path)
    try:
        xl = pd.ExcelFile(p)
    except Exception:
        return None
    if 'Top Opportunities' not in xl.sheet_names:
        return None
    try:
        df = pd.read_excel(p, 'Top Opportunities', header=4)
    except Exception:
        return None
    if 'Tracking #' not in df.columns:
        return None

    rename = {
        "Δ vs Site '25": 'delta_vs_site_25',
        "Site '25 YTD Cost/Load": 'site_25_cost_per_load',
        "Site '25 YTD Recov %": 'site_25_recov_pct',
        "Site '25 YTD Loads": 'site_25_loads',
        'This Load Cost/Load': 'this_load_cost_per_load',
        'Fill %': 'fill_rate',
        'Trailer': 'Trailer Type',
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    top_opps = _records_from_df(df)

    opps_last_week = []
    opps_last_week_meta = {}
    lw_sheet = next((s for s in xl.sheet_names if 'Last Week' in s), None)
    if lw_sheet:
        raw = pd.read_excel(p, lw_sheet, header=None)
        subtitle = str(raw.iloc[2, 0]).strip() if len(raw) > 2 and pd.notna(raw.iloc[2, 0]) else ''
        if len(raw) > 5:
            vals = raw.iloc[5].values
            kpi_cols = [0, 4, 8, 12, 16]

            def _num_at(col, default=0):
                if col < len(vals) and pd.notna(vals[col]):
                    return float(vals[col])
                return default

            opps_last_week_meta = {
                'subtitle': subtitle,
                'flagged_count': int(_num_at(kpi_cols[0], len(opps_last_week))),
                'total_cost': round(_num_at(kpi_cols[1]), 2),
                'total_net': round(_num_at(kpi_cols[2]), 2),
                'low_fill_cost': round(_num_at(kpi_cols[3]), 2),
                'threep_int_cost': round(_num_at(kpi_cols[4]), 2),
            }
        elif subtitle:
            opps_last_week_meta = {'subtitle': subtitle}
        lw_df = pd.read_excel(p, lw_sheet, header=9)
        if 'Frt Cost' in lw_df.columns and 'Cost' not in lw_df.columns:
            lw_df = lw_df.rename(columns={'Frt Cost': 'Cost', 'Net Recovery': 'Net'})
        if 'Fill %' in lw_df.columns:
            lw_df = lw_df.rename(columns={'Fill %': 'fill_rate'})
        opps_last_week = _records_from_df(lw_df.dropna(subset=['Tracking #'], how='all'))

    weeks = sorted({
        int(r['Week']) for r in top_opps
        if r.get('Week') is not None and str(r.get('Week')).strip() != ''
    })
    directors = sorted({
        str(r['Sales Director']).strip()
        for r in top_opps
        if r.get('Sales Director') not in (None, '', 'nan')
    })

    return {
        'top_opps': top_opps,
        'opps_last_week': opps_last_week,
        'opps_last_week_meta': opps_last_week_meta,
        'weeks': weeks,
        'sales_directors': directors,
    }


# ─────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────

def extract(file_path, output_path=None, meta_source_path=None):
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
    wb_opps = parse_workbook_opportunities(file_path)
    bud_from_ref = parse_reference_bud_mile(file_path)
    if bud_from_ref:
        BUD_MILE.update(bud_from_ref)

    if wb_opps:
        top_opps = wb_opps['top_opps']
        opps_last_week = wb_opps['opps_last_week']
        opps_last_week_meta = wb_opps['opps_last_week_meta']
        opp_weeks = wb_opps['weeks']
        opp_directors = wb_opps['sales_directors']
    else:
        opp_weeks = []
        opp_directors = []
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

        # Site 2025 YTD context for flagged rows (Gap 3)
        site_25 = {}
        hist_25 = hist[(hist['Year'] == 2025) & (hist['Month'].isin(ytd_months))]
        for site, grp in hist_25.groupby('Site'):
            loads = grp['Loads'].sum()
            site_25[site] = {
                'site_25_cost_per_load': safe_div(grp['Cost'].sum(), loads),
                'site_25_recov_pct': safe_div(grp['Recovery'].sum(), grp['Revenue'].sum()),
                'site_25_loads': round(loads),
            }

        def enrich_opp_row(row):
            site = row['Site']
            ctx = site_25.get(site, {})
            loads = row['Loads'] or 0
            this_cpl = safe_div(row['Cost'], loads)
            s25_cpl = ctx.get('site_25_cost_per_load') or 0
            out = row.to_dict()
            out['site_25_cost_per_load'] = ctx.get('site_25_cost_per_load', 0)
            out['site_25_recov_pct'] = ctx.get('site_25_recov_pct', 0)
            out['site_25_loads'] = ctx.get('site_25_loads', 0)
            out['this_load_cost_per_load'] = this_cpl
            out['delta_vs_site_25'] = safe_div(this_cpl, s25_cpl) if s25_cpl else 0
            return out

        opp_sorted = opp.sort_values('Cost', ascending=False)
        top_opps = [
            enrich_opp_row(r)
            for _, r in opp_sorted.head(200).iterrows()
        ]

        recent_months = ytd_months[-2:] if len(ytd_months) >= 2 else ytd_months
        opp_lw_df = opp_sorted[
            (opp_sorted['Year'] == max(recent_years)) &
            (opp_sorted['Month'].isin(recent_months))
        ]
        opps_last_week = [enrich_opp_row(r) for _, r in opp_lw_df.iterrows()]
        opps_last_week_meta = {
            'ship_date_start': recent_months[0] if recent_months else '',
            'ship_date_end': recent_months[-1] if recent_months else '',
            'total_loads_in_window': int(
                exp_opp[
                    (exp_opp['Year'] == max(recent_years)) &
                    (exp_opp['Month'].isin(recent_months))
                ]['Loads'].sum()
            ),
            'flagged_count': len(opps_last_week),
            'total_cost': round(float(opp_lw_df['Cost'].sum()), 2),
            'total_net': round(float(opp_lw_df['Net'].sum()), 2),
            'low_fill_cost': round(
                float(opp_lw_df[opp_lw_df['fill_rate'] < 0.8]['Cost'].sum()), 2
            ),
            'threep_int_cost': round(
                float(opp_lw_df[opp_lw_df['Trailer Type'] != 'CPU']['Cost'].sum()), 2
            ),
        }
        opp_directors = sorted(
            rep_hist['Sales Director'].dropna().unique().tolist()
        )

    # Filter options + drill rows for region / opps filters (Gaps 1–3)
    rep_ytd_drill = rep_hist[
        (rep_hist['Year'] == max(all_years)) &
        (rep_hist['Month'].isin(ytd_months))
    ].copy()
    filter_options = {
        'months': ytd_months,
        'weeks': opp_weeks if opp_weeks else (
            sorted(rep_ytd_drill['Week'].dropna().unique().tolist())
            if 'Week' in rep_ytd_drill.columns else []
        ),
        'sales_directors': opp_directors if opp_directors else sorted(
            rep_ytd_drill['Sales Director'].dropna().unique().tolist()
        ),
        'regions': REGIONS,
    }
    region_drill = rep_ytd_drill[
        ['Region', 'Site', 'Month', 'Sales Director', 'Channel', 'Effective Rep',
         'Loads', 'Drops', 'EUs', 'Miles', 'Revenue', 'Recovery', 'Cost', 'Net']
    ].to_dict('records')

    # Internal freight analysis (Gap 5)
    internal_mask = hist['Ship Type'].astype(str).str.upper().str.contains(
        'INTERNAL', na=False
    )
    internal_hist = hist[internal_mask]
    internal_5yr = []
    for yr in all_years:
        d = internal_hist[
            (internal_hist['Year'] == yr) &
            (internal_hist['Month'].isin(ytd_months))
        ]
        loads = d['Loads'].sum()
        miles = d['Miles'].sum()
        eus = d['EUs'].sum()
        cost = d['Cost'].sum()
        internal_5yr.append({
            'year': yr,
            'loads': round(loads),
            'drops': round(d['Drops'].sum()),
            'eus': round(eus),
            'miles': round(miles, 1),
            'cost': round(cost, 2),
            'cost_per_mile': safe_div(cost, miles),
            'cost_per_eu': safe_div(cost, eus),
            'eus_per_load': safe_div(eus, loads),
        })

    internal_by_region = []
    yr_curr = max(all_years)
    yr_prev = yr_curr - 1 if yr_curr - 1 in all_years else all_years[-2]
    for region in REGIONS:
        for label, yr in [('primary', yr_curr), ('compare', yr_prev)]:
            d = internal_hist[
                (internal_hist['Year'] == yr) &
                (internal_hist['Region'] == region) &
                (internal_hist['Month'].isin(ytd_months))
            ]
            miles = d['Miles'].sum()
            cost = d['Cost'].sum()
            internal_by_region.append({
                'region': region,
                'period': label,
                'year': yr,
                'loads': round(d['Loads'].sum()),
                'cost': round(cost, 2),
                'cost_per_mile': safe_div(cost, miles),
            })

    internal_exp = exp[
        exp['Ship Type'].astype(str).str.upper().str.contains('INTERNAL', na=False)
    ]
    internal_by_trailer = []
    for yr in [yr_prev, yr_curr]:
        d = internal_exp[
            (internal_exp['Year'] == yr) &
            (internal_exp['Month'].isin(ytd_months))
        ]
        grp = d.groupby('Trailer Type')[
            ['Loads', 'Cost', 'Miles']
        ].sum().reset_index()
        for _, r in grp.iterrows():
            internal_by_trailer.append({
                'year': yr,
                'trailer_type': r['Trailer Type'],
                'loads': round(r['Loads']),
                'cost': round(r['Cost'], 2),
                'cost_per_mile': safe_div(r['Cost'], r['Miles']),
            })

    lane_internal = lane_hist.merge(
        hist[['Region', 'Site', 'Month', 'Ship Type']].drop_duplicates(),
        on=['Region', 'Site', 'Month'],
        how='left',
    ) if 'Ship Type' not in lane_hist.columns else lane_hist
    internal_top_lanes = []
    d26 = lane_hist[
        (lane_hist['Year'] == yr_curr) &
        (lane_hist['Month'].isin(ytd_months))
    ]
    grp_lane = d26.groupby(['Site', 'Freight Ring'])[
        ['Loads', 'Cost', 'Miles', 'EUs']
    ].sum().reset_index().sort_values('Cost', ascending=False).head(30)
    for _, r in grp_lane.iterrows():
        internal_top_lanes.append({
            'site': r['Site'],
            'freight_ring': r['Freight Ring'],
            'loads': round(r['Loads']),
            'cost': round(r['Cost'], 2),
            'miles': round(r['Miles'], 1),
            'eus': round(r['EUs']),
            'cost_per_mile': safe_div(r['Cost'], r['Miles']),
        })

    # Sales performance detail (Gap 6) — 2026 YTD
    rep_26 = rep_ytd_drill.copy()
    sales_by_channel = []
    ch_grp = rep_26.groupby('Channel')[
        ['Loads', 'Drops', 'EUs', 'Miles', 'Revenue', 'Recovery', 'Cost', 'Net']
    ].sum().reset_index()
    for _, r in ch_grp.iterrows():
        sales_by_channel.append({
            'channel': r['Channel'],
            'loads': round(r['Loads']),
            'drops': round(r['Drops']),
            'eus': round(r['EUs']),
            'revenue': round(r['Revenue'], 2),
            'recovery': round(r['Recovery'], 2),
            'cost': round(r['Cost'], 2),
            'net': round(r['Net'], 2),
            'recov_pct': safe_div(r['Recovery'], r['Revenue']),
            'cost_per_eu': safe_div(r['Cost'], r['EUs']),
            'frt_pct_rev': safe_div(r['Cost'], r['Revenue']),
        })

    sales_by_rep = []
    rep_grp = rep_26.groupby(['Effective Rep', 'Channel', 'Sales Director'])[
        ['Loads', 'Drops', 'EUs', 'Revenue', 'Recovery', 'Cost', 'Net']
    ].sum().reset_index().sort_values('Net')
    for _, r in rep_grp.iterrows():
        sales_by_rep.append({
            'rep': r['Effective Rep'],
            'channel': r['Channel'],
            'sales_director': r['Sales Director'],
            'loads': round(r['Loads']),
            'drops': round(r['Drops']),
            'eus': round(r['EUs']),
            'revenue': round(r['Revenue'], 2),
            'recovery': round(r['Recovery'], 2),
            'cost': round(r['Cost'], 2),
            'net': round(r['Net'], 2),
            'recov_pct': safe_div(r['Recovery'], r['Revenue']),
            'cost_per_eu': safe_div(r['Cost'], r['EUs']),
            'frt_pct_rev': safe_div(r['Cost'], r['Revenue']),
        })


    # ══════════════════════════════════════════
    # ASSEMBLE & OUTPUT
    # ══════════════════════════════════════════
    result = {
        # Meta (cover subtitle + sidebar badge in portal HTML read these fields)
        'meta': build_freight_meta(
            all_years, ytd_months, meta_source_path or file_path, all_sites),
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
        'opps_last_week': opps_last_week,
        'opps_last_week_meta': opps_last_week_meta,
        'filter_options': filter_options,
        'region_drill': region_drill,
        'internal_5yr': internal_5yr,
        'internal_by_region': internal_by_region,
        'internal_by_trailer': internal_by_trailer,
        'internal_top_lanes': internal_top_lanes,
        'sales_by_channel': sales_by_channel,
        'sales_by_rep': sales_by_rep,
        'bud_mile': BUD_MILE,
        'region_sites': REGION_SITES,
    }

    # Determine output path
    if output_path is None:
        output_path = Path(file_path).with_name('dashboard_data.json')

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(sanitize_for_json(result), f, ensure_ascii=False, allow_nan=False)

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
    meta_source = sys.argv[3] if len(sys.argv) > 3 else None
    extract(input_file, output_file, meta_source)
