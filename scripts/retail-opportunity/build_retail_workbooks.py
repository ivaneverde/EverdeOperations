"""
build_retail_workbooks.py
--------------------------
Everde Growers — West Coast Retail Opportunity Workbook Generator
Builds all 5 weekly output workbooks from source files.

Usage:
    python build_retail_workbooks.py --week 14 --year 2026

    All source files are auto-discovered from the configured base paths,
    or can be passed explicitly via flags.

    Set EVERDE_TODAY=YYYY-MM-DD to override today's date.

Outputs (written to OUTPUT_DIR):
    Sales Manager Summary - Wk{N} {YEAR}.xlsx
    HD Sales Variance & Allocation - Wk{N} {YEAR}.xlsx
    LOW Sales Variance & Allocation - Wk{N} {YEAR}.xlsx
    Wk{N-1} Item-Level Miss Analysis - Wk{N} {YEAR}.xlsx
    FOR Source Miss Report - Wk{N} {YEAR}.xlsx

Dependencies:
    pip install pandas openpyxl pyxlsb numpy
"""

from __future__ import annotations
import os, sys, json, glob, argparse, shutil, tempfile
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import date, timedelta
from collections import defaultdict
from typing import Dict, Tuple, List

# ─────────────────────────────────────────────────────
# DATE / WEEK CONFIG
# ─────────────────────────────────────────────────────

def _resolve_today() -> date:
    if v := os.environ.get("EVERDE_TODAY"):
        try:
            return date.fromisoformat(v)
        except Exception:
            pass
    return date.today()

TODAY = _resolve_today()
ISO_YEAR, CURRENT_ISO_WEEK, _ = TODAY.isocalendar()

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--week',  type=int, default=CURRENT_ISO_WEEK,
                   help='ISO week number (e.g. 14)')
    p.add_argument('--year',  type=int, default=ISO_YEAR)
    p.add_argument('--base',  default=None,
                   help='Base folder containing source files')
    p.add_argument('--out',   default=None,
                   help='Output folder for generated workbooks')
    # Explicit file overrides
    p.add_argument('--hd-store',   default=None)
    p.add_argument('--low-store',  default=None)
    p.add_argument('--inv',        default=None)
    p.add_argument('--plan',       default=None)
    p.add_argument('--actuals',    default=None)
    p.add_argument('--hd-xref',    default=None)
    p.add_argument('--low-xref',   default=None)
    return p.parse_args()


# ─────────────────────────────────────────────────────
# FILE DISCOVERY
# ─────────────────────────────────────────────────────

NETWORK_BASE = r"\\192.168.190.10\Claude Sandbox\JS Files"
SHARED_BASE  = Path(NETWORK_BASE) / "Shared"
WCR_BASE     = Path(NETWORK_BASE) / "West Coast Retail Opportunity"
DROPS_BASE   = Path(r"\\192.168.190.10\Claude Sandbox\DataDrops\SalesOpportunity")
WEATHER_DROP = Path(r"\\192.168.190.10\Claude Sandbox\DataDrops\Weather\WeeklyDrop")
SALES_PLAN_DROP = Path(r"\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop")

def find_latest(folder, *patterns):
    for pat in patterns:
        matches = glob.glob(str(Path(folder) / pat))
        matches = [f for f in matches if 'Archive' not in f and '~$' not in f]
        if matches:
            return Path(max(matches, key=os.path.getmtime))
    return None

def find_latest_recursive(folder, *patterns):
    """Search subfolders (e.g. Shared\\Sales Data\\LOW … HD Sales Data)."""
    folder = Path(folder)
    if not folder.exists():
        return None
    for pat in patterns:
        matches = glob.glob(str(folder / "**" / pat), recursive=True)
        matches = [f for f in matches if 'Archive' not in f and '~$' not in f]
        if matches:
            return Path(max(matches, key=os.path.getmtime))
    return None

def _local_excel_path(path) -> Path:
    """Copy large UNC workbooks locally — openpyxl can fail mid-read over SMB."""
    path = Path(path)
    if str(path).startswith("\\\\"):
        dest = Path(tempfile.gettempdir()) / f"everde-retail-{path.name}"
        if not dest.exists() or dest.stat().st_mtime < path.stat().st_mtime:
            log(f"    Copying {path.name} from share…")
            shutil.copy2(path, dest)
        return dest
    return path

def resolve_sources(args) -> dict:
    base = Path(args.base) if args.base else None

    def find(explicit, *patterns):
        if explicit and Path(explicit).exists():
            return Path(explicit)
        # Weather WeeklyDrop (Jonathan retail + weather drops)
        if WEATHER_DROP.exists():
            f = find_latest(WEATHER_DROP, *patterns)
            if f: return f
        if SALES_PLAN_DROP.exists():
            f = find_latest(SALES_PLAN_DROP, *patterns)
            if f: return f
        if DROPS_BASE.exists():
            f = find_latest(DROPS_BASE, *patterns)
            if f: return f
        # Try shared folder
        if SHARED_BASE.exists():
            for subdir in ['', 'INV', 'Sales Data', 'Inventory Cross References', 'Sales Plan']:
                f = find_latest(SHARED_BASE / subdir, *patterns)
                if f: return f
            sales_data = SHARED_BASE / 'Sales Data'
            if sales_data.exists():
                f = find_latest_recursive(sales_data, *patterns)
                if f: return f
        # Try base folder
        if base:
            f = find_latest(base, *patterns)
            if f: return f
        # Try script directory
        script_dir = Path(__file__).parent
        f = find_latest(script_dir, *patterns)
        if f: return f
        return None

    return {
        'hd_store':  find(args.hd_store,  'HD week*.xlsx', 'HD_week*.xlsx',
                          'Everything week*HD.xlsx', 'HD Sales YTD*.xlsx'),
        'low_store': find(args.low_store, 'YTD BY STORE SKU*.xlsb', 'Lowes YTD*.xlsb',
                          'LOW Copy of YTD*.xlsb', 'LOW_Copy*.xlsb',
                          'LOWES*YTD*BY*STORE*.xlsb'),
        'inv':       find(args.inv,       'Inventory Transform*.xlsx',
                          'Inventory_Transform*.xlsx'),
        'plan':      find(args.plan,      '2026 Sales Plan by Item.xlsx',
                          '2026_Sales_Plan_by_Item.xlsx'),
        'actuals':   find(args.actuals,   '2026 Sales by Item*.xlsx',
                          '2026_Sales_by_Item*.xlsx'),
        'hd_xref':   find(args.hd_xref,  'Home Depot Corp-VN*.xlsb',
                          'Home_Depot_Corp-VN*.xlsb'),
        'low_xref':  find(args.low_xref, "LOWE'S xref*.xlsb", 'LOWE_S_xref*.xlsb'),
    }


# ─────────────────────────────────────────────────────
# MARKET / REGION MAPS
# ─────────────────────────────────────────────────────

# HD address category → market
HD_ADDR_MARKET = {
    'HDNO21':'N.CA', 'HDNO29':'N.CA', 'HDNO29A':'N.CA', 'HDNO44':'N.CA',
    'HDNV36':'N.CA', 'HDNV63':'N.CA',  # NV included in NorCal market
    'HDSO12':'S.CA', 'HDSO47':'S.CA', 'HDSO48':'S.CA', 'HDSO196':'S.CA',
    'HDAZ134':'S.CA','HDAZ414':'S.CA', 'HDAZ6':'S.CA',   # AZ in SoCal market
    'HDNM87':'S.CA', 'HDUT76':'S.CA', 'HDUT226':'S.CA', 'HDWN94':'S.CA',
    'HDGL8':'S.CA',
    'HDOR54':'FOR',  'HDOR542':'FOR',
}

# Lowe's address category → market
LOW_ADDR_MARKET = {
    'LOWNO':'N.CA', 'LOWNV':'N.CA',
    'LOWSO':'S.CA', 'LOWWB':'S.CA', 'LOWAZ':'S.CA', 'LOWNM':'S.CA',
    'LOSTX':'S.TX', 'LONTX':'N.TX',
}

# HD store file Market column → market
HD_MKT_MARKET = {
    'No Cal': 'N.CA',
    'So Cal': 'S.CA',
}

# Lowe's store file Subregion → market
LOW_SUB_MARKET = {
    'no cal': 'N.CA',
    'so cal': 'S.CA',
    'WP': 'S.CA', 'ZE': 'S.CA', 'WN': 'S.CA', 'WT': 'S.CA',
    'WR': 'S.CA', 'WQ': 'S.CA', 'NM/El Paso': 'S.CA',
}

# West Coast markets
WC_MARKETS = ['N.CA', 'S.CA']

# Inventory region → market
INV_REGION_MARKET = {
    'NOR CAL':'N.CA', 'SO CAL':'S.CA', 'OR':'FOR',
    'N. California':'N.CA', 'S. California':'S.CA',
}

# Sales actuals customer filter
HD_CUSTOMERS  = {'RETAIL - HOME DEPOT', 'HOME DEPOT', 'RETAIL HOME DEPOT'}
LOW_CUSTOMERS = {'RETAIL - LOWES', "RETAIL - LOWE'S", 'LOWES', "LOWE'S"}


# ─────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────

def log(msg):
    print(f"[{TODAY}] {msg}", flush=True)

def safe_div(a, b, default=0.0):
    try:
        if b and not np.isnan(float(b)) and float(b) != 0:
            return float(a) / float(b)
    except Exception:
        pass
    return default

def week_plan_denominator(week_num: int, month: int = 5) -> float:
    """Return N/4 fraction for a given week within a month.
    Wk13 = 1/4 (first week of May), Wk14 = 2/4, etc."""
    # Find which week-within-month this ISO week is
    # For May 2026: Wk13=1st wk, Wk14=2nd wk, Wk15=3rd wk, Wk16=4th wk
    # Base: Wk13 is ISO week 18 in 445 calendar → week 1 of May
    # Simplified: use current week relative to month start
    return min(4, max(1, (week_num % 4) or 4)) / 4.0


# ─────────────────────────────────────────────────────
# STEP 1: LOAD & NORMALIZE SOURCE DATA
# ─────────────────────────────────────────────────────

def load_hd_xref(path) -> pd.DataFrame:
    """HD xref: SKU → Item(s) with market mapping."""
    log(f"  Loading HD xref: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='DATA', engine='pyxlsb')
    df.columns = [str(c).strip() for c in df.columns]
    df = df.rename(columns={
        'SKU':              'sku',
        'Item':             'item',
        'Address Category': 'addr_cat',
        'Item Description': 'item_desc',
        'Everde GSV Genus': 'genus',
        'Container Code':   'size',
        'Plant Category':   'plant_cat',
    })
    df['market'] = df['addr_cat'].map(HD_ADDR_MARKET)
    df = df[df['market'].isin(WC_MARKETS + ['FOR'])].copy()
    df['sku'] = df['sku'].astype(str).str.strip()
    df['item'] = df['item'].astype(str).str.strip()
    log(f"    {len(df):,} rows, {df['sku'].nunique():,} SKUs, "
        f"{df['item'].nunique():,} items")
    return df


def load_low_xref(path) -> pd.DataFrame:
    """Lowe's xref: SKU → Item(s) with market mapping."""
    log(f"  Loading Lowe's xref: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='DATA', engine='pyxlsb')
    df.columns = [str(c).strip() for c in df.columns]
    df = df.rename(columns={
        'SKU':              'sku',
        'Item':             'item',
        'Address Category': 'addr_cat',
        'Item Description': 'item_desc',
        'Everde GSV Genus': 'genus',
        'Container Code':   'size',
        'Plant Category':   'plant_cat',
    })
    df['market'] = df['addr_cat'].map(LOW_ADDR_MARKET)
    df = df[df['market'].isin(WC_MARKETS)].copy()
    df['sku'] = df['sku'].astype(str).str.strip()
    df['item'] = df['item'].astype(str).str.strip()
    log(f"    {len(df):,} rows, {df['sku'].nunique():,} SKUs")
    return df


def build_sku_groups(hd_xref: pd.DataFrame,
                     low_xref: pd.DataFrame) -> Dict[str, str]:
    """
    Union-Find: items sharing an HD or Lowe's SKU belong to the same group.
    Returns item → group_id mapping where group_id = canonical item (lowest alpha).
    """
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for xref in [hd_xref, low_xref]:
        for sku, grp in xref.groupby('sku'):
            items = grp['item'].unique().tolist()
            for item in items[1:]:
                union(items[0], item)

    # Build item → group mapping
    all_items = set(hd_xref['item']) | set(low_xref['item'])
    item_group = {}
    # Group by canonical root, choose alphabetically first as group ID
    groups = defaultdict(list)
    for item in all_items:
        groups[find(item)].append(item)
    for root, members in groups.items():
        canonical = min(members)
        for item in members:
            item_group[item] = canonical

    log(f"  SKU Groups: {len(set(item_group.values())):,} groups "
        f"from {len(item_group):,} items")
    return item_group


def group_metadata(hd_xref: pd.DataFrame, low_xref: pd.DataFrame,
                   item_group: Dict[str, str]) -> pd.DataFrame:
    """Build group-level metadata: description, genus, size, SKU list, item list."""
    meta_rows = []
    for xref, retailer in [(hd_xref, 'HD'), (low_xref, 'LOW')]:
        for item, row in xref.drop_duplicates('item').set_index('item').iterrows():
            grp = item_group.get(item, item)
            meta_rows.append({
                'group': grp, 'item': item,
                'item_desc': row.get('item_desc', ''),
                'genus': row.get('genus', ''),
                'size': row.get('size', ''),
                'retailer': retailer,
            })

    df = pd.DataFrame(meta_rows)
    # Primary metadata per group = first item alphabetically
    meta = (df.sort_values('item')
              .groupby('group')
              .first()
              .reset_index()
              [['group','item_desc','genus','size']])
    meta.columns = ['group','description','genus','size']

    # SKU lists per group per retailer
    hd_skus = (hd_xref.assign(group=hd_xref['item'].map(item_group))
                       .groupby('group')['sku']
                       .apply(lambda x: ', '.join(sorted(x.astype(str).unique())))
                       .reset_index()
                       .rename(columns={'sku':'hd_skus'}))
    low_skus = (low_xref.assign(group=low_xref['item'].map(item_group))
                        .groupby('group')['sku']
                        .apply(lambda x: ', '.join(sorted(x.astype(str).unique())))
                        .reset_index()
                        .rename(columns={'sku':'low_skus'}))
    items_per_grp = (df.groupby('group')['item']
                       .apply(lambda x: ', '.join(sorted(x.unique())))
                       .reset_index()
                       .rename(columns={'item':'items_in_group'}))

    meta = (meta.merge(hd_skus, on='group', how='left')
                .merge(low_skus, on='group', how='left')
                .merge(items_per_grp, on='group', how='left'))
    return meta


def load_inventory(path) -> pd.DataFrame:
    """Inventory Transform: A+B and QC-pending by item × region."""
    log(f"  Loading Inventory: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='Inventory Dataset', header=0)
    df.columns = [str(c).strip() for c in df.columns]
    df = df.rename(columns={
        'Item Num':       'item',
        'Grade':          'grade',
        'Region':         'region',
        'Available QTY':  'avail_qty',
        'Total QTY':      'total_qty',
    })
    df['item']      = df['item'].astype(str).str.strip()
    df['grade']     = df['grade'].astype(str).str.strip().str.upper()
    df['avail_qty'] = pd.to_numeric(df['avail_qty'], errors='coerce').fillna(0)
    df['market']    = df['region'].map(INV_REGION_MARKET)

    # A+B = released, ready-to-ship
    AB_GRADES = {'A', 'B'}
    # QC-pending = can ship after QC clears (B2 bucket)
    QC_GRADES = {'SS','SN','GS','GN','S2N','P2N','PN','P','S2','G2','G3'}

    df['is_ab'] = df['grade'].isin(AB_GRADES)
    df['is_qc'] = df['grade'].isin(QC_GRADES)

    ab  = df[df['is_ab']].groupby(['item','market'])['avail_qty'].sum().reset_index()
    ab  = ab.rename(columns={'avail_qty':'ab_qty'})
    qc  = df[df['is_qc']].groupby(['item','market'])['avail_qty'].sum().reset_index()
    qc  = qc.rename(columns={'avail_qty':'qc_qty'})

    inv = ab.merge(qc, on=['item','market'], how='outer').fillna(0)
    log(f"    {len(inv):,} item-market combinations")
    return inv


def load_sales_plan(path, week_num: int) -> pd.DataFrame:
    """
    Sales Plan: Plan_thru_WkN = Plan(Jan-Apr) + Plan(May) × N_within_month/4.
    Grain: OrgCode × Item, then sum to Item level.
    """
    log(f"  Loading Sales Plan: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='Demand Window Prep', header=None)

    # Find header row (has 'DW Region Item')
    hdr_row = None
    for i, row in df.iterrows():
        if any('DW Region Item' in str(v) for v in row):
            hdr_row = i
            break
    if hdr_row is None:
        raise ValueError("Could not find 'DW Region Item' header in Sales Plan")

    df.columns = df.iloc[hdr_row].tolist()
    df = df.iloc[hdr_row+1:].copy()
    df = df.rename(columns={df.columns[0]: 'dw_region_item'})
    df = df[df['dw_region_item'].notna()].copy()

    # Parse OrgCode;ItemNum
    split = df['dw_region_item'].astype(str).str.split(';', n=1, expand=True)
    df['org_code'] = split[0].str.strip()
    df['item']     = split[1].str.strip() if split.shape[1] > 1 else split[0].str.strip()

    # Monthly columns
    month_cols = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    for col in month_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # Plan through Wk14: Jan+Feb+Mar+Apr + May × (week_within_month / 4)
    # Week 13 = 1/4, Week 14 = 2/4, Week 15 = 3/4, Week 16 = 4/4
    # Approximate: week_num mod 4 within the month
    # May starts at ISO week 18 ≈ user week 13
    may_frac = week_plan_denominator(week_num)

    ytd_cols = [c for c in ['JAN','FEB','MAR','APR'] if c in df.columns]
    df['plan_thru_wk'] = df[ytd_cols].sum(axis=1)
    if 'MAY' in df.columns:
        df['plan_thru_wk'] += df['MAY'] * may_frac

    # Sum to item level (across all org codes = farms)
    plan = df.groupby('item')['plan_thru_wk'].sum().reset_index()
    plan.columns = ['item', 'plan_thru_wk']
    log(f"    {len(plan):,} plan items, may_frac={may_frac:.2f}")
    return plan


def load_actuals(path, wk_cutoff: int) -> pd.DataFrame:
    """
    Sales actuals through end of last closed week.
    Filter: Customer Breakout contains HD or Lowe's retail, 445 Wk ≤ wk_cutoff.
    """
    log(f"  Loading Actuals: {Path(path).name} (through 445 Wk {wk_cutoff})")
    df = pd.read_excel(_local_excel_path(path), sheet_name='Sheet1', header=0)
    df.columns = [str(c).strip() for c in df.columns]

    # Filter to retail rows and through last closed week
    wk_col = '445 Week' if '445 Week' in df.columns else 'Gl Wk'
    df['_wk'] = pd.to_numeric(df.get(wk_col, df.get('Gl Wk', 0)), errors='coerce').fillna(0)
    df = df[df['_wk'] <= wk_cutoff].copy()

    cust_col = 'Customer Breakout' if 'Customer Breakout' in df.columns else 'Bill To Name'
    df['_cust'] = df[cust_col].astype(str).str.upper()

    hd_mask  = df['_cust'].str.contains('HOME.DEPOT|HD RETAIL', regex=True, na=False)
    low_mask = df['_cust'].str.contains("LOWE'S|LOWES|LOW RETAIL", regex=True, na=False)
    retail   = df[hd_mask | low_mask].copy()

    item_col = 'Tree' if 'Tree' in retail.columns else 'Item Num'
    qty_col  = 'Qty Inv SUM' if 'Qty Inv SUM' in retail.columns else 'Qty'
    rev_col  = 'Revenue Amt Sum' if 'Revenue Amt Sum' in retail.columns else 'Revenue'

    retail['item']    = retail[item_col].astype(str).str.strip()
    retail['qty']     = pd.to_numeric(retail[qty_col], errors='coerce').fillna(0)
    retail['revenue'] = pd.to_numeric(retail[rev_col], errors='coerce').fillna(0)
    retail['is_hd']   = hd_mask[retail.index]

    # Sum to item level
    acts = retail.groupby(['item','is_hd']).agg(
        actual_qty=('qty','sum'),
        actual_rev=('revenue','sum')
    ).reset_index()
    log(f"    {len(acts):,} item-customer rows after filter")
    return acts


def _hd_ly_week_from_columns(columns, fallback_week: int) -> int:
    import re
    for c in columns:
        m = re.match(r'LY Sales \$ WK(\d+)', str(c).strip())
        if m:
            return int(m.group(1))
        m = re.match(r'LY Sales Units WK(\d+)', str(c).strip())
        if m:
            return int(m.group(1))
    return fallback_week


def load_hd_store(path, item_group: Dict[str, str],
                  hd_xref: pd.DataFrame, week_num: int | None = None) -> pd.DataFrame:
    """
    HD weekly store file: LY sales, current inventory, on-order per store × SKU.
    Returns group × customer × market grain.
    """
    log(f"  Loading HD Store Data: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='Sheet1', header=0)
    df.columns = [str(c).strip() for c in df.columns]

    ly_week = _hd_ly_week_from_columns(df.columns, week_num or CURRENT_ISO_WEEK)
    log(f"    LY compare week: WK{ly_week}")

    df['sku']         = df['SKU Nbr'].astype(str).str.strip()
    df['store']       = df['Store Nbr'].astype(str).str.strip()
    df['store_name']  = df['Store Name'].astype(str).str.strip()
    df['market']      = df['Market Nbr'].astype(str).map(HD_MKT_MARKET).fillna(
                        df['Market Nbr'].astype(str).str.strip().map(HD_MKT_MARKET))
    df = df[df['market'].isin(WC_MARKETS)].copy()

    # Map SKU → item → group
    sku_item = hd_xref.drop_duplicates('sku').set_index('sku')['item']
    df['item']  = df['sku'].map(sku_item)
    df['group'] = df['item'].map(item_group)
    df = df[df['group'].notna()].copy()

    num_cols = {
        f'LY Sales Units WK{ly_week}': 'ly_sales_units',
        f'LY Sales $ WK{ly_week}':     'ly_sales_dlr',
        'Curr Inventory Units':    'curr_inv_units',
        'LY On Hand Units':        'ly_oh_units',
        'On Order Units':          'on_order_units',
        'Sales Units':             'ytd_sales_units',
        'Sales Retail YTD':        'ytd_sales_dlr',
        'Curr Inventory Retail':   'curr_inv_retail',
    }
    for src, dst in num_cols.items():
        if src in df.columns:
            df[dst] = pd.to_numeric(df[src], errors='coerce').fillna(0)
        else:
            df[dst] = 0.0

    # Store-level detail for Stores tab
    store_detail = df[['group','market','store','store_name',
                        'ly_sales_units','ly_sales_dlr',
                        'curr_inv_units','ly_oh_units','on_order_units',
                        'ytd_sales_units','ytd_sales_dlr','curr_inv_retail']].copy()
    store_detail = store_detail.rename(columns={'market': 'Market'})

    # Group × market grain for Items tab
    grp = df.groupby(['group','market']).agg(
        ly_wk14_units =('ly_sales_units', 'sum'),
        ly_wk14_dlr   =('ly_sales_dlr',   'sum'),
        curr_inv_units=('curr_inv_units',  'sum'),
        ly_oh_units   =('ly_oh_units',     'sum'),
        on_order_units=('on_order_units',  'sum'),
        ytd_sales_units=('ytd_sales_units','sum'),
        ytd_sales_dlr  =('ytd_sales_dlr',  'sum'),
        curr_inv_retail=('curr_inv_retail', 'sum'),
        stores_carrying=('store', 'nunique'),
    ).reset_index()
    grp['customer'] = 'HD'
    grp['pipeline'] = grp['curr_inv_units'] + grp['on_order_units']

    log(f"    {len(grp):,} HD group-market rows")
    return grp, store_detail


def load_low_store(path, item_group: Dict[str, str],
                   low_xref: pd.DataFrame) -> pd.DataFrame:
    """
    Lowe's YTD BY STORE SKU file.
    """
    log(f"  Loading Lowe's Store Data: {Path(path).name}")
    df = pd.read_excel(path, sheet_name='Sheet 1', header=0, engine='pyxlsb')
    df.columns = [str(c).strip() for c in df.columns]

    # Lowe's uses Item number directly (not SKU) in the store file
    # In Lowe's store file, 'Item' column = Lowe's SKU number
    # Need to map SKU → our Item code via low_xref, then → group
    df['low_sku']     = df['Item'].astype(str).str.strip()
    df['store']       = df['Store'].astype(str).str.strip()
    df['store_name']  = df['Store Desc'].astype(str).str.strip()
    df['sub']         = df['Subregion'].astype(str).str.strip()
    df['market']      = df['sub'].map(LOW_SUB_MARKET)
    df = df[df['market'].isin(WC_MARKETS)].copy()

    # Build SKU → item map from low_xref
    sku_to_item = low_xref.drop_duplicates('sku').set_index('sku')['item']
    df['item']  = df['low_sku'].map(sku_to_item)
    df['group'] = df['item'].map(item_group)
    df = df[df['group'].notna()].copy()

    num_cols = {
        'LY Sales Units WK14':  'ly_sales_units',
        'LY Sales $ WK14':      'ly_sales_dlr',
        'Curr Inventory Units': 'curr_inv_units',
        'LY On Hand Units':     'ly_oh_units',
        'Curr On Order Units':  'on_order_units',
        'Sales Units':          'ytd_sales_units',
        'Sales Retail YTD':     'ytd_sales_dlr',
        'Curr Inventory Retail':'curr_inv_retail',
        'Avg Retail Price':     'avg_retail_price',
    }
    for src, dst in num_cols.items():
        if src in df.columns:
            df[dst] = pd.to_numeric(df[src], errors='coerce').fillna(0)
        else:
            df[dst] = 0.0

    store_detail = df[['group','market','store','store_name',
                        'ly_sales_units','ly_sales_dlr',
                        'curr_inv_units','ly_oh_units','on_order_units',
                        'ytd_sales_units','ytd_sales_dlr','curr_inv_retail']].copy()
    store_detail = store_detail.rename(columns={'market': 'Market'})

    grp = df.groupby(['group','market']).agg(
        ly_wk14_units =('ly_sales_units', 'sum'),
        ly_wk14_dlr   =('ly_sales_dlr',   'sum'),
        curr_inv_units=('curr_inv_units',  'sum'),
        ly_oh_units   =('ly_oh_units',     'sum'),
        on_order_units=('on_order_units',  'sum'),
        ytd_sales_units=('ytd_sales_units','sum'),
        ytd_sales_dlr  =('ytd_sales_dlr',  'sum'),
        curr_inv_retail=('curr_inv_retail', 'sum'),
        stores_carrying=('store', 'nunique'),
    ).reset_index()
    grp['customer'] = 'Lowes'
    grp['pipeline'] = grp['curr_inv_units'] + grp['on_order_units']

    log(f"    {len(grp):,} Lowe's group-market rows")
    return grp, store_detail


# ─────────────────────────────────────────────────────
# STEP 2: CORE CALCULATIONS
# ─────────────────────────────────────────────────────

def compute_need(hd_grp, low_grp, plan_df, actuals_df,
                 inv_df, item_group, meta_df) -> pd.DataFrame:
    """
    Main computation: for each (group × customer × market) compute:
    Plan → Corp Shortfall → Catch-Up → Forward Demand → Pipeline → Net Need → B1/B2/B3/B4
    """
    log("  Computing Plan, Shortfall, Catch-Up, Forward Demand, Net Need...")

    # Combine HD + Lowe's store data
    all_store = pd.concat([hd_grp, low_grp], ignore_index=True)

    # Add plan: map item → group, sum plan to group level
    plan_grp = (plan_df.assign(group=plan_df['item'].map(item_group))
                       .dropna(subset=['group'])
                       .groupby('group')['plan_thru_wk']
                       .sum().reset_index())

    # Add actuals: map item → group, split HD vs Lowes
    actuals_df['group'] = actuals_df['item'].map(item_group)
    acts_grp = (actuals_df.dropna(subset=['group'])
                           .groupby(['group','is_hd'])
                           .agg(actual_qty=('actual_qty','sum'),
                                actual_rev=('actual_rev','sum'))
                           .reset_index())
    acts_hd  = acts_grp[acts_grp['is_hd']].set_index('group')[['actual_qty','actual_rev']]
    acts_low = acts_grp[~acts_grp['is_hd']].set_index('group')[['actual_qty','actual_rev']]

    # Add inventory: A+B and QC by item → group
    inv_df['group'] = inv_df['item'].map(item_group)
    inv_grp = (inv_df.dropna(subset=['group'])
                     .groupby(['group','market'])
                     .agg(ab_qty=('ab_qty','sum'), qc_qty=('qc_qty','sum'))
                     .reset_index())

    rows = []
    for _, row in all_store.iterrows():
        grp = row['group']
        cust = row['customer']
        mkt = row['market']
        is_hd = cust == 'HD'

        # Plan at group × customer grain
        plan_qty = plan_grp.set_index('group')['plan_thru_wk'].get(grp, 0)
        # Pro-rata HD/LOW: split plan by share of LY
        hd_ly   = hd_grp[(hd_grp['group']==grp)]['ly_wk14_units'].sum()
        low_ly  = low_grp[(low_grp['group']==grp)]['ly_wk14_units'].sum()
        total_ly = hd_ly + low_ly
        if total_ly > 0:
            cust_share = hd_ly / total_ly if is_hd else low_ly / total_ly
        else:
            cust_share = 0.5
        plan_cust = plan_qty * cust_share

        # Actuals
        acts = acts_hd if is_hd else acts_low
        actual_qty = acts['actual_qty'].get(grp, 0) if grp in acts.index else 0

        # Corp shortfall
        corp_shortfall = max(0.0, plan_cust - actual_qty)

        # LY Wk14 for this market
        ly_units = float(row.get('ly_wk14_units', 0) or 0)
        ly_dlr   = float(row.get('ly_wk14_dlr', 0) or 0)

        # Catch-up allocation by market LY share
        mkt_data_hd  = hd_grp[hd_grp['group']==grp]
        mkt_data_low = low_grp[low_grp['group']==grp]
        mkt_data = mkt_data_hd if is_hd else mkt_data_low
        total_cust_ly = mkt_data['ly_wk14_units'].sum()
        mkt_ly_for_cust = mkt_data[mkt_data['market']==mkt]['ly_wk14_units'].sum()
        if total_cust_ly > 0:
            catch_up_share = corp_shortfall * safe_div(mkt_ly_for_cust, total_cust_ly)
        else:
            catch_up_share = corp_shortfall / max(1, len(WC_MARKETS))

        # Forward demand
        fwd_demand = ly_units + catch_up_share

        # Pipeline (current inventory at stores)
        pipeline = float(row.get('pipeline', 0) or 0)

        # Net need (clipped at 0)
        net_need = max(0.0, fwd_demand - pipeline)

        # Inventory buckets (A+B and QC from our farms)
        inv_row = inv_grp[(inv_grp['group']==grp) & (inv_grp['market']==mkt)]
        # Also include FOR (cross-region) inventory
        inv_for = inv_grp[(inv_grp['group']==grp) & (inv_grp['market']=='FOR')]
        ab_local  = float(inv_row['ab_qty'].sum()) if len(inv_row) else 0.0
        qc_local  = float(inv_row['qc_qty'].sum()) if len(inv_row) else 0.0
        ab_for    = float(inv_for['ab_qty'].sum())  if len(inv_for) else 0.0

        # Pro-rata AB between HD and Lowes
        ab_cust = ab_local * cust_share
        qc_cust = qc_local * cust_share
        ab_for_cust = ab_for * cust_share

        # B1: Ship Now (A+B)
        b1 = min(net_need, ab_cust)
        remaining = net_need - b1

        # B2: QC release
        b2 = min(remaining, qc_cust)
        remaining -= b2

        # B3: Cross-region pull (FOR A+B surplus)
        b3 = min(remaining, ab_for_cust)
        remaining -= b3

        # B4: Plan At Risk
        b4 = remaining

        # Prices
        curr_inv_units = float(row.get('curr_inv_units', 0) or 0)
        curr_inv_retail = float(row.get('curr_inv_retail', 0) or 0)
        retail_ppu = safe_div(curr_inv_retail, curr_inv_units) if curr_inv_units > 0 else (
            safe_div(ly_dlr, ly_units) if ly_units > 0 else 15.0)
        actual_rev = (acts_hd if is_hd else acts_low)['actual_rev'].get(grp, 0) if grp in (acts_hd if is_hd else acts_low).index else 0
        wholesale_ppu = safe_div(actual_rev, actual_qty) if actual_qty > 0 else 8.0

        # Sell-through
        ytd_sales = float(row.get('ytd_sales_units', 0) or 0)
        our_shipped = actual_qty
        sell_thru_ty = safe_div(ytd_sales, our_shipped) * 100 if our_shipped > 0 else None

        # Plan Miss Flag
        plan_miss_flag = ''
        if corp_shortfall > 50:
            if ly_units == 0:
                plan_miss_flag = 'Plan miss BUT no LY store data for this market'
            elif ly_units < corp_shortfall * 0.10:
                plan_miss_flag = f'Plan miss with very low LY demand (LY={int(ly_units)}u vs shortfall={int(corp_shortfall)}u)'

        # Supply status
        if net_need == 0:
            supply_status = 'No Need this week'
        elif b1 >= net_need:
            supply_status = 'Supply OK (A+B covers)'
        elif b1 + b2 >= net_need:
            supply_status = 'Need QC release'
        elif b1 + b2 + b3 >= net_need:
            supply_status = 'Cover via crossreg (FOR)'
        elif b1 + b2 + b3 > 0:
            supply_status = 'PARTIAL (some supply, some at risk)'
        else:
            supply_status = 'SHORT (no supply available)'

        # Get metadata
        meta_row = meta_df[meta_df['group']==grp].iloc[0] if len(meta_df[meta_df['group']==grp]) else None
        skus     = meta_row['hd_skus'] if meta_row is not None and is_hd else (
                   meta_row['low_skus'] if meta_row is not None else '')
        items_in = meta_row.get('items_in_group', '') if meta_row is not None else ''
        desc     = meta_row['description'] if meta_row is not None else ''
        genus    = meta_row['genus'] if meta_row is not None else ''
        size     = meta_row['size'] if meta_row is not None else ''

        rows.append({
            'Cust_Mkt':              f"{cust} {mkt}",
            'Customer':              cust,
            'Market':                mkt,
            'SKUs_in_Group':         skus,
            'Items_in_Group':        items_in,
            'Description':           desc,
            'Genus':                 genus,
            'Size':                  size,
            'Supply_Status':         supply_status,
            'Plan_Miss_Flag':        plan_miss_flag,
            'Stores_Carrying':       int(row.get('stores_carrying', 0)),
            'Group_Sales_Units_TY':  round(ytd_sales),
            'Group_LY_Sales_Units':  round(ly_units),
            'Group_Our_Shipped_TY':  round(our_shipped),
            'Group_TY_Sell_Thru_pct':round(sell_thru_ty, 1) if sell_thru_ty else None,
            'Plan_thru_user_Wk':     round(plan_cust, 2),
            'Actual_thru_user_Wk':   round(actual_qty, 2),
            'Plan_Var_Qty':          round(plan_cust - actual_qty, 2),
            'Plan_Var_$_retail':     round((plan_cust - actual_qty) * retail_ppu, 0),
            'Plan_Var_$_Wholesale':  round((plan_cust - actual_qty) * wholesale_ppu, 0),
            'Corp_Shortfall':        round(corp_shortfall, 2),
            'LY_Wk_Units':           round(ly_units, 2),
            'Catch_Up_Units':        round(catch_up_share, 2),
            'Forward_Demand_Units':  round(fwd_demand, 2),
            'Curr_Inv_Units':        round(curr_inv_units),
            'LY_OH_Units':           round(float(row.get('ly_oh_units', 0) or 0)),
            'On_Order_Units':        round(float(row.get('on_order_units', 0) or 0)),
            'Pipeline_Units':        round(pipeline),
            'Net_Need_Units':        round(net_need, 2),
            'Net_Need_$_retail':     round(net_need * retail_ppu, 0),
            'Net_Need_$_wholesale':  round(net_need * wholesale_ppu, 0),
            'ShipNow_AB_Units':      round(b1, 2),
            'Ship_QC_Units':         round(b2, 2),
            'Pull_Crossreg_Units':   round(b3, 2),
            'Plan_at_Risk_Units':    round(b4, 2),
            'ShipNow_Opp_$_retail':  round((b1+b2+b3) * retail_ppu, 0),
            'ShipNow_Opp_$_wholesale': round((b1+b2+b3) * wholesale_ppu, 0),
            'Retail_PPU':            round(retail_ppu, 2),
            'Wholesale_PPU':         round(wholesale_ppu, 2),
            'group':                 grp,
        })

    result = pd.DataFrame(rows)
    log(f"  Computed {len(result):,} group-customer-market rows")
    return result


# ─────────────────────────────────────────────────────
# STEP 3: WRITE OUTPUT WORKBOOKS
# ─────────────────────────────────────────────────────

def write_workbook(writer, tabs: dict):
    """Write a dict of {sheet_name: DataFrame} to an ExcelWriter."""
    for sheet, df in tabs.items():
        df.to_excel(writer, sheet_name=sheet, index=False)


def build_exec_summary(result: pd.DataFrame, week_num: int) -> dict:
    """Build the headline summary table."""
    summary_rows = []
    for cust in ['HD', 'Lowes', 'COMBINED']:
        if cust == 'COMBINED':
            r = result
        else:
            r = result[result['Customer'] == cust]
        summary_rows.append({
            'Customer':              cust,
            'Plan_thru_Wk_units':    round(r['Plan_thru_user_Wk'].sum()),
            'Actual_thru_Wk_units':  round(r['Actual_thru_user_Wk'].sum()),
            'Plan_Var_units':        round(r['Plan_Var_Qty'].sum()),
            'Plan_Var_$_retail':     round(r['Plan_Var_$_retail'].sum()),
            'Plan_Var_$_wholesale':  round(r['Plan_Var_$_Wholesale'].sum()),
            'Net_Need_units':        round(r['Net_Need_Units'].sum()),
            'Net_Need_$_retail':     round(r['Net_Need_$_retail'].sum()),
            'Net_Need_$_wholesale':  round(r['Net_Need_$_wholesale'].sum()),
            'Ship_Now_units':        round(r['ShipNow_AB_Units'].sum()),
            'Ship_Now_$_retail':     round(r['ShipNow_Opp_$_retail'].sum()),
            'Ship_Now_$_wholesale':  round(r['ShipNow_Opp_$_wholesale'].sum()),
            'Plan_At_Risk_units':    round(r['Plan_at_Risk_Units'].sum()),
            'Plan_At_Risk_$_retail': round(r['Plan_at_Risk_Units'].sum() *
                                           safe_div(r['Net_Need_$_retail'].sum(),
                                                    r['Net_Need_Units'].sum(), 15)),
        })
    return pd.DataFrame(summary_rows)


def build_region_comparison(result: pd.DataFrame) -> pd.DataFrame:
    """Region comparison: customer × market grain."""
    grp = result.groupby(['Customer','Market']).agg(
        **{
        'Plan_thru_Wk14_units': ('Plan_thru_user_Wk','sum'),
        'Actual_thru_Wk13_units': ('Actual_thru_user_Wk','sum'),
        'Plan_Var_Qty': ('Plan_Var_Qty','sum'),
        'Plan_Var_$_retail': ('Plan_Var_$_retail','sum'),
        'Plan_Var_$_wholesale': ('Plan_Var_$_Wholesale','sum'),
        'Corp_Shortfall': ('Corp_Shortfall','sum'),
        'LY_Wk14_Units': ('LY_Wk_Units','sum'),
        'Catch_Up_Units': ('Catch_Up_Units','sum'),
        'Forward_Demand': ('Forward_Demand_Units','sum'),
        'Curr_Inv': ('Curr_Inv_Units','sum'),
        'On_Order': ('On_Order_Units','sum'),
        'Pipeline': ('Pipeline_Units','sum'),
        'Net_Need_Units': ('Net_Need_Units','sum'),
        'Net_Need_$_retail': ('Net_Need_$_retail','sum'),
        'Net_Need_$_wholesale': ('Net_Need_$_wholesale','sum'),
        'B1_Units': ('ShipNow_AB_Units','sum'),
        'B1_$_retail': ('ShipNow_Opp_$_retail','sum'),
        'B2_Units': ('Ship_QC_Units','sum'),
        'B3_Units': ('Pull_Crossreg_Units','sum'),
        'B4_Units': ('Plan_at_Risk_Units','sum'),
        }
    ).reset_index()
    grp['TY_Sell_Thru_pct'] = (
        grp['Actual_thru_Wk13_units'] /
        grp['Plan_thru_Wk14_units'].replace(0, np.nan) * 100
    ).round(1)
    return grp.sort_values(['Customer','Market'])


def build_top30_ship_now(result: pd.DataFrame) -> pd.DataFrame:
    """Top 30 SKU groups by Ship-Now opportunity $."""
    r = result[result['Net_Need_Units'] > 0].copy()
    r['ShipNow_total'] = r['ShipNow_AB_Units'] + r['Ship_QC_Units'] + r['Pull_Crossreg_Units']
    r['Net_Need_Units_HDretail'] = r['Net_Need_$_retail']
    r['ShipNow_Opp_HDretail']   = r['ShipNow_Opp_$_retail']
    r['ShipNow_Opp_Wholesale']  = r['ShipNow_Opp_$_wholesale']
    return (r.sort_values('ShipNow_Opp_$_retail', ascending=False)
             .head(30)
             [['Customer','Market','SKUs_in_Group','Items_in_Group',
               'Description','Genus','Size','Supply_Status','Plan_Miss_Flag',
               'Group_TY_Sell_Thru_pct','LY_Wk_Units',
               'Net_Need_Units','ShipNow_AB_Units','Ship_QC_Units',
               'Pull_Crossreg_Units','Plan_at_Risk_Units',
               'Net_Need_Units_HDretail','ShipNow_Opp_HDretail',
               'ShipNow_Opp_Wholesale']])


def build_top30_behind_plan(result: pd.DataFrame) -> pd.DataFrame:
    """Top 30 behind plan by Plan Variance $."""
    r = result[result['Plan_Var_Qty'] > 0].copy()
    return (r.sort_values('Plan_Var_$_retail', ascending=False)
             .head(30)
             [['Customer','Market','SKUs_in_Group','Items_in_Group',
               'Description','Genus','Size','Plan_Miss_Flag',
               'Group_TY_Sell_Thru_pct',
               'Plan_thru_user_Wk','Actual_thru_user_Wk',
               'Plan_Var_Qty','Plan_Var_$_retail','Plan_Var_$_Wholesale',
               'LY_Wk_Units','Forward_Demand_Units','Pipeline_Units',
               'Net_Need_Units','ShipNow_AB_Units','Ship_QC_Units',
               'Pull_Crossreg_Units','Plan_at_Risk_Units']])


def build_top20_stores(hd_store_detail: pd.DataFrame,
                       low_store_detail: pd.DataFrame,
                       result: pd.DataFrame) -> pd.DataFrame:
    """Top 20 stores by Net Need."""
    # Get retail PPU per group-market from result
    hd_d = hd_store_detail.copy()
    hd_d['Customer'] = 'HD'
    low_d = low_store_detail.copy()
    low_d['Customer'] = 'Lowes'
    frames = [f for f in [hd_d, low_d] if len(f) > 0 and 'Market' in f.columns]
    if not frames:
        return pd.DataFrame()
    all_stores = pd.concat(frames, ignore_index=True)
    all_stores = all_stores.rename(columns={'market': 'Market'})

    grp = all_stores.groupby(['Customer','Market','store','store_name']).agg(
        LY_Wk14_Units=('ly_sales_units','sum'),
        TY_Sales=('ytd_sales_units','sum'),
        LY_Sales=('ly_sales_units','sum'),
        Curr_Inv=('curr_inv_units','sum'),
        On_Order=('on_order_units','sum'),
        Sales_Retail_YTD=('ytd_sales_dlr','sum'),
        Curr_Inv_Retail=('curr_inv_retail','sum'),
    ).reset_index()

    # Approximate Net Need at store level
    grp['Pipeline'] = grp['Curr_Inv'] + grp['On_Order']
    grp['Net_Need'] = (grp['LY_Wk14_Units'] - grp['Pipeline']).clip(lower=0)
    grp['Net_Need_$'] = grp['Net_Need'] * 15  # fallback PPU

    grp = grp.rename(columns={'store':'Store Nbr','store_name':'Store Name'})
    return (grp.sort_values('Net_Need_$', ascending=False)
               .head(20)
               [['Customer','Market','Store Nbr','Store Name',
                 'LY_Wk14_Units','TY_Sales','LY_Sales',
                 'Curr_Inv','On_Order','Net_Need',
                 'Curr_Inv_Retail','Sales_Retail_YTD']])


def build_for_source_miss(result: pd.DataFrame, inv_df: pd.DataFrame,
                           item_group: dict) -> dict:
    """FOR Source Miss: FOR-grown items only × HD/Lowe × N.CA/S.CA."""
    # FOR inventory by group
    inv_df['group'] = inv_df['item'].map(item_group)
    for_inv = (inv_df[inv_df['market']=='FOR']
               .groupby('group')['ab_qty'].sum().reset_index()
               .rename(columns={'ab_qty':'for_ab_qty'}))

    tabs = {}
    for cust in ['HD', 'Lowes']:
        for mkt in ['N.CA', 'S.CA']:
            r = result[(result['Customer']==cust) & (result['Market']==mkt)].copy()
            r = r.merge(for_inv, on='group', how='left').fillna({'for_ab_qty': 0})
            r = r[r['for_ab_qty'] > 0].copy()
            r = r.sort_values('Net_Need_$_retail', ascending=False)
            key = f"{cust}_{mkt.replace('.','_')}"
            tabs[key] = r[['Description','Genus','Size',
                           'for_ab_qty','Net_Need_Units','Net_Need_$_retail',
                           'Plan_Miss_Flag','Supply_Status']].copy()
            tabs[key].columns = ['Description','Genus','Size',
                                  'FOR A+B Available','Net Need Units',
                                  'Net Need $ retail','Plan Miss Flag',
                                  'Supply Status']
    return tabs


# ─────────────────────────────────────────────────────
# STEP 4: WRITE ALL 5 WORKBOOKS
# ─────────────────────────────────────────────────────

def write_all_workbooks(result, hd_store_detail, low_store_detail,
                        inv_df, item_group, meta_df, week_num, year, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    label = f"Wk{week_num} {year}"
    exec_df   = build_exec_summary(result, week_num)
    region_df = build_region_comparison(result)
    top30_sn  = build_top30_ship_now(result)
    top30_bp  = build_top30_behind_plan(result)
    top20_st  = build_top20_stores(hd_store_detail, low_store_detail, result)
    for_tabs  = build_for_source_miss(result, inv_df.copy(), item_group)

    # ── 1. SALES MANAGER SUMMARY ──
    path = out / f"Sales Manager Summary - {label}.xlsx"
    with pd.ExcelWriter(path, engine='openpyxl') as w:
        pd.DataFrame([['Everde West Coast Retail Opportunity',
                        f'{label} | Built {TODAY}']]).to_excel(
            w, sheet_name='Change Log', index=False, header=False)
        exec_df.to_excel(w, sheet_name='Executive Summary', index=False)
        region_df.to_excel(w, sheet_name='Region Comparison', index=False)
        top30_sn.to_excel(w, sheet_name='Top 30 by Ship-Now Opp', index=False)
        top30_bp.to_excel(w, sheet_name='Top 30 Items Behind Plan', index=False)
        top20_st.to_excel(w, sheet_name='Top 20 Stores', index=False)
        pd.DataFrame().to_excel(w, sheet_name='Combined Suggested Orders (P2)', index=False)
    log(f"  OK {path.name}")

    # ── 2. HD VARIANCE & ALLOCATION ──
    path = out / f"HD Sales Variance & Allocation - {label}.xlsx"
    with pd.ExcelWriter(path, engine='openpyxl') as w:
        pd.DataFrame([['HD Sales Variance & Allocation',
                        f'{label} | Built {TODAY}']]).to_excel(
            w, sheet_name='Change Log', index=False, header=False)
        for mkt in ['N.CA', 'S.CA']:
            mkt_key = mkt.replace('.','')
            items = result[(result['Customer']=='HD') &
                           (result['Market']==mkt)].sort_values(
                'Net_Need_$_retail', ascending=False)
            stores = hd_store_detail[hd_store_detail['Market']==mkt].sort_values(
                'ly_sales_units', ascending=False)
            # Exec summary per market
            exec_mkt = build_exec_summary(
                result[(result['Customer']=='HD')&(result['Market']==mkt)],
                week_num)
            exec_mkt.to_excel(w, sheet_name=f'Exec Summary - {mkt}', index=False)
            items.to_excel(w, sheet_name=f'HD {mkt} Items', index=False)
            stores.to_excel(w, sheet_name=f'HD {mkt} Stores', index=False)
    log(f"  OK {path.name}")

    # ── 3. LOW VARIANCE & ALLOCATION ──
    path = out / f"LOW Sales Variance & Allocation - {label}.xlsx"
    with pd.ExcelWriter(path, engine='openpyxl') as w:
        pd.DataFrame([['Lowes Sales Variance & Allocation',
                        f'{label} | Built {TODAY}']]).to_excel(
            w, sheet_name='Change Log', index=False, header=False)
        for mkt in ['N.CA', 'S.CA']:
            items = result[(result['Customer']=='Lowes') &
                           (result['Market']==mkt)].sort_values(
                'Net_Need_$_retail', ascending=False)
            stores = low_store_detail[low_store_detail['Market']==mkt].sort_values(
                'ly_sales_units', ascending=False)
            exec_mkt = build_exec_summary(
                result[(result['Customer']=='Lowes')&(result['Market']==mkt)],
                week_num)
            exec_mkt.to_excel(w, sheet_name=f'Exec Summary - {mkt}', index=False)
            items.to_excel(w, sheet_name=f'Lowes {mkt} Items', index=False)
            stores.to_excel(w, sheet_name=f'Lowes {mkt} Stores', index=False)
    log(f"  OK {path.name}")

    # ── 4. ITEM-LEVEL MISS ANALYSIS ──
    path = out / f"Wk{week_num-1} Item-Level Miss Analysis - {label}.xlsx"
    b1 = result[result['ShipNow_AB_Units'] > 0].sort_values(
        'ShipNow_AB_Units', ascending=False)
    b2 = result[result['Ship_QC_Units'] > 0].sort_values(
        'Ship_QC_Units', ascending=False)
    b3 = result[result['Pull_Crossreg_Units'] > 0].sort_values(
        'Pull_Crossreg_Units', ascending=False)
    b4 = result[result['Plan_at_Risk_Units'] > 0].sort_values(
        'Plan_at_Risk_Units', ascending=False)
    miss_all = result[result['Net_Need_Units'] > 0].sort_values(
        'Net_Need_$_retail', ascending=False)

    # Summary
    summary = pd.DataFrame([
        {'Bucket': 'B1 Ship Now (A+B)', 'Units': round(b1['ShipNow_AB_Units'].sum()),
         'Retail $': round(b1['ShipNow_Opp_$_retail'].sum()), 'Groups': len(b1)},
        {'Bucket': 'B2 QC Release', 'Units': round(b2['Ship_QC_Units'].sum()),
         'Retail $': round(b2['ShipNow_Opp_$_retail'].sum()), 'Groups': len(b2)},
        {'Bucket': 'B3 Cross-Region', 'Units': round(b3['Pull_Crossreg_Units'].sum()),
         'Retail $': round(b3['ShipNow_Opp_$_retail'].sum()), 'Groups': len(b3)},
        {'Bucket': 'B4 Plan At Risk', 'Units': round(b4['Plan_at_Risk_Units'].sum()),
         'Retail $': 0, 'Groups': len(b4)},
    ])
    with pd.ExcelWriter(path, engine='openpyxl') as w:
        pd.DataFrame([['Miss Analysis', label]]).to_excel(
            w, sheet_name='Change Log', index=False, header=False)
        summary.to_excel(w, sheet_name='Summary', index=False)
        miss_all.to_excel(w, sheet_name='Top Misses (All Buckets)', index=False)
        b1.to_excel(w, sheet_name='B1 Miss (A+B Easy Ship)', index=False)
        b2.to_excel(w, sheet_name='B2 Miss (Need QC)', index=False)
        b3.to_excel(w, sheet_name='B3 Miss (Crossreg Pull)', index=False)
        result[result['Plan_Var_Qty'] < -10].sort_values(
            'Plan_Var_Qty').to_excel(w, sheet_name='Over-Shipped', index=False)
        result[result['Plan_thru_user_Wk'] == 0].to_excel(
            w, sheet_name='Not in Forecast', index=False)
    log(f"  OK {path.name}")

    # ── 5. FOR SOURCE MISS ──
    path = out / f"FOR Source Miss Report - {label}.xlsx"
    with pd.ExcelWriter(path, engine='openpyxl') as w:
        pd.DataFrame([['FOR Source Miss Report', label]]).to_excel(
            w, sheet_name='Change Log', index=False, header=False)
        for key, df in for_tabs.items():
            cust, mkt = key.split('_', 1)
            mkt_label = mkt.replace('_', '.')
            sheet_name = f"{cust} {mkt_label} FOR-Source"
            df.to_excel(w, sheet_name=sheet_name, index=False)
    log(f"  OK {path.name}")

    return out


# ─────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────

def main():
    args = parse_args()
    week_num = args.week
    year     = args.year
    out_dir  = args.out or str(Path(__file__).parent / "outputs")

    log("=" * 60)
    log(f"West Coast Retail Opportunity Builder — Wk{week_num} {year}")
    log("=" * 60)

    sources = resolve_sources(args)
    log("\nSource files:")
    for k, v in sources.items():
        log(f"  {k}: {Path(v).name if v else 'NOT FOUND'}")

    missing = [k for k, v in sources.items() if v is None]
    if missing:
        log(f"\nERROR: Missing required source files: {missing}")
        log("Use --base or explicit file flags to specify locations.")
        sys.exit(1)

    log("\nLoading source data...")
    hd_xref   = load_hd_xref(sources['hd_xref'])
    low_xref  = load_low_xref(sources['low_xref'])
    item_group = build_sku_groups(hd_xref, low_xref)
    meta_df   = group_metadata(hd_xref, low_xref, item_group)
    inv_df    = load_inventory(sources['inv'])
    plan_df   = load_sales_plan(sources['plan'], week_num)
    actuals_df = load_actuals(sources['actuals'], week_num + 4)  # 445 wk offset

    log("\nLoading store data...")
    hd_grp, hd_stores   = load_hd_store(sources['hd_store'], item_group, hd_xref, week_num)
    low_grp, low_stores  = load_low_store(sources['low_store'], item_group, low_xref)

    log("\nRunning calculations...")
    result = compute_need(hd_grp, low_grp, plan_df, actuals_df,
                          inv_df, item_group, meta_df)

    log("\nWriting workbooks...")
    out = write_all_workbooks(result, hd_stores, low_stores,
                              inv_df, item_group, meta_df,
                              week_num, year, out_dir)

    log(f"\n{'='*60}")
    log(f"DONE. 5 workbooks written to: {out}")
    log(f"  Net Need: ${result['Net_Need_$_retail'].sum():,.0f} retail")
    log(f"  Ship-Now: ${result['ShipNow_Opp_$_retail'].sum():,.0f} retail")
    log(f"  Plan At Risk: {result['Plan_at_Risk_Units'].sum():,.0f} units")


if __name__ == '__main__':
    main()
