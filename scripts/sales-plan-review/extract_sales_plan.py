"""
extract_sales_plan.py
---------------------
Everde Growers — Sales Plan Review Data Extractor
Runs the full forward fulfillment model and outputs dashboard_data.json
for the NOR CAL Sales Plan web portal.

Usage:
    python extract_sales_plan.py \\
        --inv  "Inventory_Transform_051126.xlsx" \\
        --ytd  "2026_Sales_by_Item_051126.xlsx"  \\
        --out  "sales_plan_data.json"

    All other source files (plan, V158, xrefs, cache) are expected in the
    same directory as this script, or passed via optional flags.

Dependencies:
    pip install pandas openpyxl pyxlsb polars fastexcel pyarrow
"""

import sys
import json
import argparse
import os
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────────────
# ARGUMENT PARSING
# ─────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description='Everde Sales Plan Extractor')
    p.add_argument('--inv',   required=True,  help='Inventory Transform xlsx (weekly upload)')
    p.add_argument('--ytd',   required=True,  help='2026 Sales by Item xlsx (weekly upload)')
    p.add_argument('--plan',  default=None,   help='2026 Sales Plan by Item.xlsx (stable)')
    p.add_argument('--v158',  default=None,   help='Key Item Report V158.xlsx (stable)')
    p.add_argument('--hd',    default=None,   help='HD xref xlsb (stable)')
    p.add_argument('--lowes', default=None,   help="Lowe's xref xlsb (stable)")
    p.add_argument('--cache', default=None,   help='Cache directory for parquet files')
    p.add_argument('--out',   default='sales_plan_data.json', help='Output JSON path')
    p.add_argument('--rebuild-cache', action='store_true', help='Force rebuild parquet cache')
    return p.parse_args()


# ─────────────────────────────────────────────────────
# PATH RESOLUTION
# ─────────────────────────────────────────────────────

def resolve_paths(args):
    """Resolve all file paths, falling back to script directory for stable files."""
    base = Path(__file__).parent

    def find(arg_val, *candidates):
        if arg_val and Path(arg_val).exists():
            return Path(arg_val)
        for c in candidates:
            p = base / c
            if p.exists():
                return p
        return None

    paths = {
        'inv':   Path(args.inv),
        'ytd':   Path(args.ytd),
        'plan':  find(args.plan,  '2026_Sales_Plan_by_Item.xlsx', '2026 Sales Plan by Item.xlsx'),
        'v158':  find(args.v158,  'Key_Item_Report_V158.xlsx',    'Key Item Report V158.xlsx'),
        'hd':    find(args.hd,    'Home_Depot_Corp-VN_PO_xref_rev_04222026.xlsb'),
        'lowes': find(args.lowes, "LOWE_S_xref_rev_04292029.xlsb", "LOWE'S xref rev.04292029.xlsb"),
        'cache': Path(args.cache) if args.cache else base / 'cache',
        'out':   Path(args.out),
    }

    for k, v in paths.items():
        if k in ('plan', 'v158', 'hd', 'lowes', 'cache', 'out'):
            continue
        if not v or not v.exists():
            print(f"ERROR: Required file not found: {k} = {v}")
            sys.exit(1)

    return paths


# ─────────────────────────────────────────────────────
# RUN MODEL
# ─────────────────────────────────────────────────────

def run_model(paths, rebuild_cache=False):
    """
    Import nor_cal_forward_patched (or nor_cal_forward) and run the model
    with patched paths. Returns the model data object (d).
    """
    base = Path(__file__).parent

    # Patch the module's path constants before importing
    import importlib.util, types

    # Try patched version first, then original
    for script_name in ['nor_cal_forward_patched', 'nor_cal_forward']:
        script_path = base / f'{script_name}.py'
        if script_path.exists():
            break
    else:
        print("ERROR: nor_cal_forward_patched.py or nor_cal_forward.py not found in script directory")
        sys.exit(1)

    spec = importlib.util.spec_from_file_location('nor_cal_forward', script_path)
    M = importlib.util.module_from_spec(spec)

    # Inject patched paths before execution
    M.PATH_INV   = paths['inv']
    M.PATH_YTD   = paths['ytd']
    if paths.get('plan'):  M.PATH_PLAN  = paths['plan']
    if paths.get('v158'):  M.PATH_V158  = paths['v158']
    if paths.get('hd'):    M.PATH_HD_XREF    = paths['hd']
    if paths.get('lowes'): M.PATH_LOWES_XREF = paths['lowes']
    M.CACHE_DIR  = paths['cache']
    paths['cache'].mkdir(parents=True, exist_ok=True)

    # Detect snapshot date from inventory filename
    stem = paths['inv'].stem  # e.g. Inventory_Transform_051126
    digits = ''.join(c for c in stem if c.isdigit())[-6:]
    if len(digits) == 6:
        mm, dd, yy = digits[:2], digits[2:4], digits[4:]
        snap = f"20{yy}-{mm}-{dd}"
        try:
            pd.Timestamp(snap)
            M.SNAP_DATE = pd.Timestamp(snap)
            print(f"  Auto-detected snapshot date: {snap}")
        except Exception:
            pass

    spec.loader.exec_module(M)

    # Call model functions to get data object
    d = M.run_model() if hasattr(M, 'run_model') else M._run_and_return()
    return M, d


# ─────────────────────────────────────────────────────
# EXTRACT DASHBOARD DATA FROM OUTPUT WORKBOOK
# ─────────────────────────────────────────────────────

def safe(v):
    if v is None: return None
    if isinstance(v, float) and np.isnan(v): return None
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating,)): return float(v)
    if isinstance(v, pd.Timestamp): return str(v.date())
    return v


def extract_from_workbook(wb_path):
    """Extract all dashboard data from the generated output workbook."""
    xl = pd.ExcelFile(wb_path)
    CUSTOMERS = ['HD', 'Lowes', 'Walmart', 'West Coast', 'Midwest']

    # ── Exec Summary walks ──
    exec_df = xl.parse('Exec Summary', header=None)
    walk_configs = {
        'walk1_ye':  {'start': 3,  'cols': ['Customer','Original Plan $','Plan Miss $','Over-Plan $','Projected $','Net $','Net %']},
        'walk2_fwd': {'start': 15, 'cols': ['Customer','Original Plan $','Plan Miss $','Over-Plan $','Projected $','Net $','Net %']},
        'walk3_ytd': {'start': 27, 'cols': ['Customer','Original Plan $','Plan Miss $','Over-Plan $','Projected $','Net $','Net %']},
    }
    walks = {}
    for wk, cfg in walk_configs.items():
        rows, in_data = [], False
        for i in range(cfg['start'], min(cfg['start']+15, len(exec_df))):
            row = exec_df.iloc[i]
            non_nan = [(j,v) for j,v in enumerate(row) if str(v) != 'nan' and v is not None]
            if not non_nan: continue
            vals = [v for j,v in non_nan]
            if any('Customer' in str(v) for v in vals):
                in_data = True; continue
            if in_data and len(non_nan) >= 5:
                row_dict = {cfg['cols'][k]: safe(v) for k,(j,v) in enumerate(non_nan) if k < len(cfg['cols'])}
                if row_dict.get('Customer') not in [None, 'nan']:
                    rows.append(row_dict)
        walks[wk] = rows

    def parse_detail_tab(tab, header_row=4, max_rows=None):
        df = xl.parse(tab, header=None)
        cols_raw = df.iloc[header_row].tolist()
        cols = [str(v) if str(v) != 'nan' else f'col_{i}' for i,v in enumerate(cols_raw)]
        rows = []
        for i in range(header_row+1, len(df)):
            row = df.iloc[i]
            vals = [safe(v) for v in row]
            non_nan = [v for v in vals if v is not None]
            if len(non_nan) < 4: continue
            if not isinstance(non_nan[0], (int, float)): continue
            d = {cols[k]: vals[k] for k in range(min(len(cols), len(vals)))}
            rows.append(d)
            if max_rows and len(rows) >= max_rows: break
        return rows

    plan_ki   = parse_detail_tab('Plan by KI')
    miss_sum  = parse_detail_tab('Miss Summary by KI')
    miss_cust = parse_detail_tab('Miss by Customer x KI', max_rows=500)
    excess    = parse_detail_tab('Excess by KI')
    ytd_perf  = parse_detail_tab('YTD Performance', max_rows=500)
    lift_sum  = parse_detail_tab('Lift Summary by KI')
    over_plan = parse_detail_tab('Over-Plan by KI')

    # ── Channel summary ──
    chan_df = xl.parse('Channel Summary', header=None)
    channel = {}
    curr_cust = None
    for i in range(len(chan_df)):
        row = chan_df.iloc[i]
        vals = [v for v in row if str(v) != 'nan' and v is not None]
        if not vals: continue
        first = str(vals[0]).strip()
        if first in CUSTOMERS:
            curr_cust = first
            channel[curr_cust] = {'summary': {}, 'top_ki': []}
        elif curr_cust and len(vals) >= 2:
            k = str(vals[0]).strip()
            v = safe(vals[1])
            if k in ['Plan $ YE', 'Projected Achievement $ YE', 'Plan Miss $ YE', 'Miss % YE']:
                channel[curr_cust]['summary'][k] = v
            elif isinstance(safe(vals[0]), (int, float)) and len(vals) >= 5:
                channel[curr_cust]['top_ki'].append({
                    'rank': safe(vals[0]), 'ki': str(vals[1]),
                    'plan_dlr': safe(vals[2]), 'miss_dlr': safe(vals[3]),
                    'miss_pct': safe(vals[4])
                })

    # ── Totals ──
    w1 = [r for r in walks.get('walk1_ye', []) if r.get('Customer') in CUSTOMERS]
    totals_ye = {
        'plan':      sum(r.get('Original Plan $', 0) or 0 for r in w1),
        'miss':      sum(r.get('Plan Miss $', 0) or 0 for r in w1),
        'over_plan': sum(r.get('Over-Plan $', 0) or 0 for r in w1),
        'net':       sum(r.get('Net $', 0) or 0 for r in w1),
    }

    # ── Excess reason breakdown from Build Health tab ──
    excess_reasons = {
        'Plan met + lift fully filled - true overproduction': {'count': 0, 'units': 0, 'dlr': 0},
        'Inventory timing mismatch': {'count': 0, 'units': 0, 'dlr': 0},
        'No forward plan, no history': {'count': 0, 'units': 0, 'dlr': 0},
        'No forward plan, has history': {'count': 0, 'units': 0, 'dlr': 0},
        'Plan met, no history available to lift': {'count': 0, 'units': 0, 'dlr': 0},
    }
    for r in excess:
        reason = r.get('Reason') or ''
        for k in excess_reasons:
            if k.lower() in reason.lower() or reason.lower() in k.lower():
                excess_reasons[k]['count'] += 1
                excess_reasons[k]['units'] += int(r.get('Excess QTY') or 0)
                excess_reasons[k]['dlr']   += float(r.get('Excess $') or 0)
                break

    total_excess = sum(float(r.get('Excess $') or 0) for r in excess)

    return {
        'meta': {
            'region':       'NOR CAL',
            'snapshot':     str(pd.Timestamp('today').date()),
            'plan_source':  '2026 Sales Plan by Item',
            'fwd_months':   'Jun–Dec 2026',
            'ytd_months':   'Jan–May 2026',
            'customers':    CUSTOMERS,
            'generated_at': datetime.now().isoformat(),
        },
        'totals_ye':      totals_ye,
        'walks':          walks,
        'plan_by_ki':     plan_ki,
        'miss_summary':   miss_sum,
        'miss_by_customer': miss_cust,
        'excess_by_ki':   excess,
        'ytd_performance': ytd_perf,
        'lift_summary':   lift_sum,
        'over_plan':      over_plan,
        'channel_summary': channel,
        'excess_reasons': excess_reasons,
        'total_excess_dlr': total_excess,
    }


# ─────────────────────────────────────────────────────
# MAIN — SIMPLIFIED EXTRACT MODE
# ─────────────────────────────────────────────────────

def extract_from_existing_workbook(wb_path, out_path):
    """
    Fast path: if the output workbook already exists (pre-generated by
    build_norcal_workbook_patched.py), just extract JSON from it.
    Use this when the portal uploads trigger a pre-built workbook refresh.
    """
    print(f"Extracting from: {wb_path}")
    data = extract_from_workbook(wb_path)
    with open(out_path, 'w') as f:
        json.dump(data, f, default=str)
    size = Path(out_path).stat().st_size
    print(f"Output: {out_path} ({size/1024:.1f} KB)")
    return str(out_path)


# ─────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────

if __name__ == '__main__':
    # If called with just a workbook path (fast extract mode)
    if len(sys.argv) == 2 and sys.argv[1].endswith('.xlsx'):
        wb = sys.argv[1]
        out = str(Path(wb).with_name('sales_plan_data.json'))
        extract_from_existing_workbook(wb, out)
        sys.exit(0)

    # Full pipeline mode
    args = parse_args()
    paths = resolve_paths(args)

    print("="*60)
    print("Everde Sales Plan Extractor")
    print("="*60)
    print(f"  Inventory:  {paths['inv']}")
    print(f"  YTD Sales:  {paths['ytd']}")
    print(f"  Output:     {paths['out']}")

    # Step 1: Generate the workbook via build_norcal_workbook_patched.py
    import subprocess
    base = Path(__file__).parent
    build_script = base / 'build_norcal_workbook_patched.py'

    if build_script.exists():
        print("\nStep 1: Running workbook builder...")
        result = subprocess.run(
            [sys.executable, str(build_script)],
            cwd=str(base), capture_output=False
        )
        if result.returncode != 0:
            print("ERROR: Workbook builder failed")
            sys.exit(1)
    else:
        print("WARNING: build_norcal_workbook_patched.py not found — skipping build step")

    # Step 2: Extract JSON from the output workbook
    wb_candidates = sorted(base.glob('NOR_CAL_Forward_Looking_*.xlsx'))
    if not wb_candidates:
        print("ERROR: No output workbook found after build step")
        sys.exit(1)

    wb_path = wb_candidates[-1]  # most recent
    print(f"\nStep 2: Extracting from {wb_path.name}...")
    extract_from_existing_workbook(wb_path, paths['out'])
    print("\nDONE.")
