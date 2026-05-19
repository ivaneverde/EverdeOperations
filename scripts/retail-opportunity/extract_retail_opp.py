"""
extract_retail_opp.py
---------------------
Everde Growers — West Coast Retail Opportunity Data Extractor
Reads the 5 weekly output workbooks and outputs retail_opp_data.json
for the web portal dashboard.

Usage (two modes):

  Mode 1 — Read from a folder containing the 5 workbooks:
    python extract_retail_opp.py --folder "path/to/West Coast Retail Opportunity/"

  Mode 2 — Pass files explicitly:
    python extract_retail_opp.py \
        --sms   "Sales Manager Summary - Wk14 2026.xlsx" \
        --hd    "HD Sales Variance & Allocation - Wk14 2026.xlsx" \
        --low   "LOW Sales Variance & Allocation - Wk14 2026.xlsx" \
        --miss  "Wk13 Item-Level Miss Analysis.xlsx" \
        --for   "FOR Source Miss Report - Wk14 2026.xlsx" \
        --out   "retail_opp_data.json"

  Mode 3 — Weekly drop folder (portal standard):
    python extract_retail_opp.py --weeklydrop "path/to/weeklydrop/"

Dependencies:
    pip install pandas openpyxl
"""

import sys
import json
import argparse
import glob
import os
import re
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime


# ─────────────────────────────────────────────────────
# ARGUMENT PARSING
# ─────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description='Everde West Coast Retail Opportunity Extractor')
    p.add_argument('--folder',    default=None, help='Folder containing all 5 output workbooks')
    p.add_argument('--weeklydrop',default=None, help='Weekly drop folder path')
    p.add_argument('--sms',  default=None, help='Sales Manager Summary xlsx')
    p.add_argument('--hd',   default=None, help='HD Sales Variance & Allocation xlsx')
    p.add_argument('--low',  default=None, help='LOW Sales Variance & Allocation xlsx')
    p.add_argument('--miss', default=None, help='Item-Level Miss Analysis xlsx')
    p.add_argument('--fore', default=None, help='FOR Source Miss Report xlsx')
    p.add_argument('--out',  default='retail_opp_data.json', help='Output JSON path')
    return p.parse_args()


# ─────────────────────────────────────────────────────
# FILE DISCOVERY
# ─────────────────────────────────────────────────────

def find_latest(folder, pattern):
    """Find most recently modified file matching glob pattern in folder."""
    matches = glob.glob(str(Path(folder) / pattern))
    # Exclude archive and temp files
    matches = [f for f in matches if 'Archive' not in f and '~$' not in f]
    if not matches:
        return None
    return max(matches, key=os.path.getmtime)


def resolve_files(args):
    """Resolve all 5 file paths from args."""
    folder = args.folder or args.weeklydrop

    def find(explicit, *patterns):
        if explicit and Path(explicit).exists():
            return Path(explicit)
        if folder:
            for pat in patterns:
                f = find_latest(folder, pat)
                if f:
                    return Path(f)
        return None

    files = {
        'sms':  find(args.sms,  'Sales Manager Summary*.xlsx',
                                'Sales_Manager_Summary*.xlsx'),
        'hd':   find(args.hd,   'HD Sales Variance*.xlsx',
                                'HD_Sales_Variance*.xlsx'),
        'low':  find(args.low,  'LOW Sales Variance*.xlsx',
                                'LOW_Sales_Variance*.xlsx',
                                'Lowes Sales Variance*.xlsx'),
        'miss': find(args.miss, 'Wk* Item-Level Miss*.xlsx',
                                'Wk*_Item-Level_Miss*.xlsx',
                                '*Item*Miss*.xlsx'),
        'fore': find(args.fore, 'FOR Source Miss*.xlsx',
                                'FOR_Source_Miss*.xlsx'),
    }

    missing = [k for k, v in files.items() if v is None]
    if missing:
        print(f"WARNING: Could not find files for: {missing}")
        print(f"  Searched in: {folder}")

    return files


# ─────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────

def safe(v):
    """Convert numpy/pandas types to JSON-serializable Python types."""
    if v is None:
        return None
    try:
        if isinstance(v, float) and np.isnan(v):
            return None
    except Exception:
        pass
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, pd.Timestamp):
        return str(v.date())
    if isinstance(v, bool):
        return v
    return v


def parse_tab(xl, tab, header_row=3, max_rows=300):
    """
    Parse a workbook tab where row `header_row` (0-indexed) contains
    column names and data starts at header_row+1.
    Standard pattern across all 5 West Coast Retail workbooks.
    """
    try:
        df = xl.parse(tab, header=None)
    except Exception as e:
        print(f"  WARNING: could not parse tab '{tab}': {e}")
        return []

    if len(df) <= header_row:
        return []

    cols_raw = df.iloc[header_row].tolist()
    cols = [str(v) if str(v) != 'nan' else f'col_{i}'
            for i, v in enumerate(cols_raw)]

    rows = []
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        vals = [safe(v) for v in row]
        non_nan = [v for v in vals if v is not None]
        if len(non_nan) < 3:
            continue
        d = {cols[k]: vals[k] for k in range(min(len(cols), len(vals)))}
        rows.append(d)
        if len(rows) >= max_rows:
            break
    return rows


def detect_week_from_filename(files):
    """Extract week number and date from workbook filenames."""
    for path in files.values():
        if path is None:
            continue
        name = str(path)
        m = re.search(r'Wk(\d+)', name, re.IGNORECASE)
        if m:
            wk = int(m.group(1))
            # Try to extract refresh date
            m2 = re.search(r'(\d{1,2})[._-](\d{1,2})', name)
            date_str = f"5/{m2.group(2)}/2026" if m2 else None
            return wk, date_str
    return None, None


# ─────────────────────────────────────────────────────
# EXEC SUMMARY EXTRACTION
# ─────────────────────────────────────────────────────

def extract_exec_summary(xl):
    """Extract headline KPIs and region crosstab from Sales Manager Summary."""
    df = xl.parse('Executive Summary', header=None)

    CUSTOMERS = ['HD', 'Lowes', 'COMBINED']
    COL_MAP = [
        'Customer', 'Plan_thru_Wk_units', 'Actual_thru_Wk_units',
        'Plan_Var_units', 'Plan_Var_$_retail', 'Plan_Var_$_wholesale',
        'Net_Need_units', 'Net_Need_$_retail', 'Net_Need_$_wholesale',
        'Ship_Now_units', 'Ship_Now_$_retail', 'Ship_Now_$_wholesale',
        'Plan_At_Risk_units', 'Plan_At_Risk_$_retail'
    ]

    headline = []
    region_crosstab = []
    action_buckets = []

    for i in range(len(df)):
        row = df.iloc[i]
        non_nan = [v for v in row if str(v) != 'nan' and v is not None]
        if not non_nan:
            continue

        first = str(non_nan[0]).strip()

        # Headline rows (HD / Lowes / COMBINED)
        if first in ['HD', 'Lowes', 'COMBINED']:
            row_dict = {COL_MAP[k]: safe(v)
                        for k, v in enumerate(non_nan)
                        if k < len(COL_MAP)}
            headline.append(row_dict)

        # Region crosstab (N.CA / S.CA rows)
        if first in ['HD', 'Lowes', 'TOTAL'] and len(non_nan) >= 4:
            if any(str(v) in ['N.CA', 'S.CA'] for v in non_nan):
                region_crosstab.append({
                    'Customer': first,
                    'NCA_Net_Need': safe(non_nan[1]) if len(non_nan) > 1 else None,
                    'SCA_Net_Need': safe(non_nan[2]) if len(non_nan) > 2 else None,
                    'Total_Net_Need': safe(non_nan[3]) if len(non_nan) > 3 else None,
                })

        # Action bucket rows (1. Ship Now / 2. QC Release etc.)
        for bucket_label in ['1.', '2.', '3.', '4.']:
            if first.startswith(bucket_label):
                action_buckets.append({
                    'bucket': first,
                    'units': safe(non_nan[1]) if len(non_nan) > 1 else None,
                    'retail': safe(non_nan[2]) if len(non_nan) > 2 else None,
                    'wholesale': safe(non_nan[3]) if len(non_nan) > 3 else None,
                    'description': str(non_nan[4]) if len(non_nan) > 4 else None,
                })

    # Build key_numbers from headline rows
    key_numbers = {}
    for row in headline:
        cust = row.get('Customer', '').upper()
        key = cust.lower().replace(' ', '_')
        key_numbers[key] = {
            'plan_thru_wk': row.get('Plan_thru_Wk_units'),
            'actual_thru_wk': row.get('Actual_thru_Wk_units'),
            'plan_var_units': row.get('Plan_Var_units'),
            'plan_var_retail': row.get('Plan_Var_$_retail'),
            'plan_var_wholesale': row.get('Plan_Var_$_wholesale'),
            'net_need_units': row.get('Net_Need_units'),
            'net_need_retail': row.get('Net_Need_$_retail'),
            'net_need_wholesale': row.get('Net_Need_$_wholesale'),
            'ship_now_units': row.get('Ship_Now_units'),
            'ship_now_retail': row.get('Ship_Now_$_retail'),
            'ship_now_wholesale': row.get('Ship_Now_$_wholesale'),
            'plan_at_risk_units': row.get('Plan_At_Risk_units'),
            'plan_at_risk_retail': row.get('Plan_At_Risk_$_retail'),
        }

    return headline, key_numbers, region_crosstab, action_buckets


# ─────────────────────────────────────────────────────
# TOP 30 TABLES — slim key columns
# ─────────────────────────────────────────────────────

SHIP_NOW_KEEP = [
    'Customer', 'Market', 'Description', 'Genus', 'Size',
    'Supply_Status', 'Plan_Miss_Flag', 'Group_TY_Sell_Thru_pct',
    'LY_Wk14_Units', 'Net_Need_Units', 'ShipNow_AB_Units',
    'Ship_QC_Units', 'Pull_Crossreg_Units', 'Plan_at_Risk_Units',
    'Net_Need_Units_HDretail', 'ShipNow_Opp_HDretail', 'ShipNow_Opp_Wholesale',
]

BEHIND_KEEP = [
    'Customer', 'Market', 'Description', 'Genus', 'Size',
    'Plan_Miss_Flag', 'Group_TY_Sell_Thru_pct', 'Group_LY_Sell_Thru_pct',
    'Plan_thru_user_Wk14', 'Actual_thru_user_Wk13', 'Plan_Var_Qty',
    'Plan_Var_$_HDretail', 'Plan_Var_$_Wholesale',
    'Net_Need_Units', 'ShipNow_AB_Units', 'Ship_QC_Units',
    'Pull_Crossreg_Units', 'Plan_at_Risk_Units',
]


def slim(rows, keep_cols):
    """Keep only specified columns, ignoring missing ones gracefully."""
    return [{k: r.get(k) for k in keep_cols if k in r} for r in rows]


# ─────────────────────────────────────────────────────
# RETAILER DETAIL EXTRACTION
# ─────────────────────────────────────────────────────

def extract_retailer_detail(xl, retailer_prefix):
    """Extract exec summary and items tabs for HD or Lowes."""
    tabs = xl.sheet_names
    result = {}

    for market in ['N.CA', 'S.CA']:
        mkt_key = 'nca' if 'N' in market else 'sca'
        exec_tab = f"Exec Summary - {market}"
        items_tab = f"{retailer_prefix} {market} Items"
        stores_tab = f"{retailer_prefix} {market} Stores"

        if exec_tab in tabs:
            result[f'exec_{mkt_key}'] = parse_tab(xl, exec_tab, max_rows=50)
        if items_tab in tabs:
            result[f'items_{mkt_key}'] = parse_tab(xl, items_tab, max_rows=150)
        if stores_tab in tabs:
            result[f'stores_{mkt_key}'] = parse_tab(xl, stores_tab, max_rows=100)

    return result


# ─────────────────────────────────────────────────────
# MISS ANALYSIS EXTRACTION
# ─────────────────────────────────────────────────────

def extract_miss_analysis(xl):
    """Extract all bucket tabs from Item-Level Miss Analysis workbook."""
    tabs = xl.sheet_names
    result = {}

    tab_map = {
        'summary':      'Summary',
        'top_all':      'Top Misses (All Buckets)',
        'b1':           'B1 Miss (A+B Easy Ship)',
        'b2':           'B2 Miss (Need QC)',
        'b3':           'B3 Miss (Crossreg Pull)',
        'over_shipped': 'Over-Shipped',
        'not_in_forecast': 'Not in Forecast',
    }

    for key, tab in tab_map.items():
        if tab in tabs:
            result[key] = parse_tab(xl, tab, max_rows=100)
        else:
            result[key] = []

    # Summary KPIs: extract bucket totals from Summary tab
    result['bucket_totals'] = {}
    if 'Summary' in tabs:
        df = xl.parse('Summary', header=None)
        for i in range(len(df)):
            row = df.iloc[i]
            vals = [v for v in row if str(v) != 'nan' and v is not None]
            if len(vals) >= 2:
                label = str(vals[0]).strip()
                for bucket in ['B1', 'B2', 'B3', 'B4']:
                    if bucket in label:
                        result['bucket_totals'][label] = {
                            'units': safe(vals[1]) if len(vals) > 1 else None,
                            'retail': safe(vals[2]) if len(vals) > 2 else None,
                        }

    return result


# ─────────────────────────────────────────────────────
# FOR SOURCE MISS EXTRACTION
# ─────────────────────────────────────────────────────

def extract_for_source(xl):
    """Extract FOR-grown items miss by retailer × market."""
    tabs = xl.sheet_names
    result = {}

    tab_map = {
        'hd_nca':  'HD N.CA FOR-Source',
        'hd_sca':  'HD S.CA FOR-Source',
        'low_nca': 'Lowes N.CA FOR-Source',
        'low_sca': 'Lowes S.CA FOR-Source',
    }

    for key, tab in tab_map.items():
        if tab in tabs:
            result[key] = parse_tab(xl, tab, max_rows=100)
        else:
            result[key] = []

    return result


# ─────────────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────────────

def extract(files, output_path):
    print("=" * 60)
    print("Everde West Coast Retail Opportunity Extractor")
    print("=" * 60)

    for name, path in files.items():
        if path:
            print(f"  {name}: {Path(path).name}")
        else:
            print(f"  {name}: NOT FOUND")

    # Detect week number from filenames
    week_num, refresh_date = detect_week_from_filename(files)
    print(f"\nDetected week: Wk{week_num} | Refresh: {refresh_date}")

    # ── SALES MANAGER SUMMARY ──────────────────────────────────
    result = {
        'meta': {
            'week':         week_num,
            'refresh_date': refresh_date,
            'generated_at': datetime.now().isoformat(),
            'markets':      ['N.CA', 'S.CA'],
            'retailers':    ['HD', 'Lowes'],
        },
        'key_numbers':      {},
        'headline':         [],
        'region_crosstab':  [],
        'action_buckets':   [],
        'top30_ship_now':   [],
        'top30_behind_plan':[],
        'top20_stores':     [],
        'hd':               {},
        'lowes':            {},
        'miss_analysis':    {},
        'for_source':       {},
    }

    if files.get('sms'):
        print("\nReading Sales Manager Summary...")
        xl_sms = pd.ExcelFile(files['sms'])

        headline, key_numbers, crosstab, buckets = extract_exec_summary(xl_sms)
        result['headline']        = headline
        result['key_numbers']     = key_numbers
        result['region_crosstab'] = crosstab
        result['action_buckets']  = buckets

        # Top 30 Ship Now
        if 'Top 30 by Ship-Now Opp' in xl_sms.sheet_names:
            rows = parse_tab(xl_sms, 'Top 30 by Ship-Now Opp', max_rows=35)
            result['top30_ship_now'] = slim(rows, SHIP_NOW_KEEP)
            print(f"  Top 30 Ship-Now: {len(result['top30_ship_now'])} rows")

        # Top 30 Behind Plan
        if 'Top 30 Items Behind Plan' in xl_sms.sheet_names:
            rows = parse_tab(xl_sms, 'Top 30 Items Behind Plan', max_rows=35)
            result['top30_behind_plan'] = slim(rows, BEHIND_KEEP)
            print(f"  Top 30 Behind Plan: {len(result['top30_behind_plan'])} rows")

        # Top 20 Stores
        if 'Top 20 Stores' in xl_sms.sheet_names:
            result['top20_stores'] = parse_tab(xl_sms, 'Top 20 Stores', max_rows=25)
            print(f"  Top 20 Stores: {len(result['top20_stores'])} rows")

        # Region Comparison
        if 'Region Comparison' in xl_sms.sheet_names:
            result['region_comparison'] = parse_tab(
                xl_sms, 'Region Comparison', max_rows=10)

    # ── HD DETAIL ─────────────────────────────────────────────
    if files.get('hd'):
        print("\nReading HD Detail...")
        xl_hd = pd.ExcelFile(files['hd'])
        result['hd'] = extract_retailer_detail(xl_hd, 'HD')
        for k, v in result['hd'].items():
            print(f"  HD {k}: {len(v)} rows")

    # ── LOWES DETAIL ──────────────────────────────────────────
    if files.get('low'):
        print("\nReading Lowes Detail...")
        xl_low = pd.ExcelFile(files['low'])
        result['lowes'] = extract_retailer_detail(xl_low, 'Lowes')
        for k, v in result['lowes'].items():
            print(f"  Lowes {k}: {len(v)} rows")

    # ── MISS ANALYSIS ─────────────────────────────────────────
    if files.get('miss'):
        print("\nReading Miss Analysis...")
        xl_miss = pd.ExcelFile(files['miss'])
        result['miss_analysis'] = extract_miss_analysis(xl_miss)
        for k, v in result['miss_analysis'].items():
            if isinstance(v, list):
                print(f"  Miss {k}: {len(v)} rows")

    # ── FOR SOURCE MISS ───────────────────────────────────────
    if files.get('fore'):
        print("\nReading FOR Source Miss...")
        xl_for = pd.ExcelFile(files['fore'])
        result['for_source'] = extract_for_source(xl_for)
        for k, v in result['for_source'].items():
            print(f"  FOR {k}: {len(v)} rows")

    # ── SAVE OUTPUT ───────────────────────────────────────────
    with open(output_path, 'w') as f:
        json.dump(result, f, default=str)

    size_kb = Path(output_path).stat().st_size / 1024
    print(f"\nOutput: {output_path} ({size_kb:.1f} KB)")
    print("DONE.")
    return str(output_path)


# ─────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────

if __name__ == '__main__':
    args = parse_args()

    # Quick mode: single folder arg without flag
    if len(sys.argv) == 2 and not sys.argv[1].startswith('--'):
        folder = sys.argv[1]
        args.folder = folder
        args.out = str(Path(folder) / 'retail_opp_data.json')

    files = resolve_files(args)
    extract(files, args.out)
