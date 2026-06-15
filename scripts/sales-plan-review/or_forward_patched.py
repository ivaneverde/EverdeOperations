"""
or_forward_patched.py
─────────────────────
Everde Growers — Oregon (OR) Forward-Looking Fulfillment Model
Cloned and adapted from nor_cal_forward_patched.py (May 2026)

This module computes the OR forward-looking inventory vs sales plan,
YTD miss analysis, and excess-at-farm metrics for Oregon accounts.

Oregon accounts covered:
  - Home Depot (OR stores only, filtered from HD xref)
  - Lowe's (OR stores only, filtered from LOWE'S xref)
  - Oregon regional / independent (West Coast channel, OR subset)

Usage (called by build_or_workbook_patched.py):
    import or_forward_patched as M
    M.PATH_INV   = Path("Inventory_Transform_MMDDYY.xlsx")
    M.PATH_YTD   = Path("2026_Sales_by_Item_MMDDYY.xlsx")
    M.PATH_PLAN  = Path("2026_Sales_Plan_by_Item.xlsx")   # same shared file as NOR CAL
    M.PATH_V158  = Path("Key_Item_Report_V158.xlsx")
    M.PATH_HD_XREF    = Path("Home_Depot_Corp-VN_PO_xref_rev_04222026.xlsb")
    M.PATH_LOWES_XREF = Path("LOWE_S_xref_rev_04292026.xlsb")
    M.CACHE_DIR  = Path("cache_or/")
    M.run()

Output: populates M.d  (the data object consumed by build_or_workbook_patched.py)

Dependencies:
    pip install pandas openpyxl pyxlsb polars fastexcel pyarrow
"""

from __future__ import annotations
import sys
import os
import re
import json
import pickle
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, date
from typing import Any

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ─────────────────────────────────────────────────────
# PATH CONSTANTS — overridden by build_or_workbook_patched.py
# ─────────────────────────────────────────────────────

BASE = Path(__file__).parent

PATH_INV        = BASE / "Inventory_Transform_latest.xlsx"
PATH_YTD        = BASE / "2026_Sales_by_Item_latest.xlsx"
PATH_PLAN       = BASE / "2026_Sales_Plan_by_Item.xlsx"
PATH_V158       = BASE / "Key_Item_Report_V158.xlsx"
PATH_HD_XREF    = BASE / "Home_Depot_Corp-VN_PO_xref_rev_04222026.xlsb"
PATH_LOWES_XREF = BASE / "LOWE_S_xref_rev_04292026.xlsb"
CACHE_DIR       = BASE / "cache_or"

# ─────────────────────────────────────────────────────
# OR-SPECIFIC CONSTANTS
# ─────────────────────────────────────────────────────

REGION_LABEL  = "OREGON"
REGION_SHORT  = "OR"

# Oregon state FIPS + store filter keywords for HD/Lowe's xref
OR_STATE_CODES   = {"OR", "Oregon", "OREGON"}
OR_ZIP_PREFIX    = ("97", "970", "971", "972", "973", "974", "975", "976", "977",
                    "978", "979", "980", "981", "982", "983", "984", "985", "986",
                    "987", "988", "989", "990", "991", "992", "993", "994")

# Channel → Customer name mapping (matches NOR CAL pattern)
CHANNEL_MAP = {
    "HD":       "Home Depot",
    "LOW":      "Lowe's",
    "WC":       "West Coast",
    "IND":      "Independent",
    "REGIONAL": "OR Regional",
}

# Months for this reporting cycle (May 2026 snapshot)
YTD_MONTHS  = [1, 2, 3, 4, 5]          # Jan–May actual
FWD_MONTHS  = [6, 7, 8, 9, 10, 11, 12] # Jun–Dec forward

# GDD / planting calendar for OR (slightly later than CA)
PLANT_WINDOW_START = 3   # March
PLANT_WINDOW_END   = 6   # June

# ─────────────────────────────────────────────────────
# DATA OBJECT — populated by run()
# ─────────────────────────────────────────────────────

class DataObject:
    """Container for all computed model outputs."""
    def __init__(self):
        self.snapshot_date: str = ""
        self.region: str = REGION_LABEL
        self.region_short: str = REGION_SHORT

        # Master KI universe for OR
        self.ki_master: pd.DataFrame | None = None

        # YTD actuals
        self.ytd_actual: pd.DataFrame | None = None
        self.ytd_plan:   pd.DataFrame | None = None
        self.ytd_miss:   pd.DataFrame | None = None

        # Forward-looking (Jun–Dec)
        self.fwd_plan:   pd.DataFrame | None = None
        self.fwd_inv:    pd.DataFrame | None = None
        self.fwd_gap:    pd.DataFrame | None = None  # inventory vs forward plan

        # Excess at farm
        self.excess:     pd.DataFrame | None = None

        # Historical lift (3-yr smoothed history > current plan)
        self.hist_lift:  pd.DataFrame | None = None

        # Channel summary (by customer)
        self.channel:    pd.DataFrame | None = None

        # Walk tables (same structure as NOR CAL exec summary)
        self.walk_ye:    dict | None = None   # Year-end walk
        self.walk_fwd:   dict | None = None   # Forward walk
        self.walk_ytd:   dict | None = None   # YTD walk

        # Top KIs by miss $
        self.top_miss:   pd.DataFrame | None = None

        # KPIs for exec summary
        self.kpis: dict = {}

        # Data quality / audit
        self.warnings: list[str] = []
        self.row_counts: dict = {}


d = DataObject()


# ─────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────

def _safe_div(num, den, default=0.0):
    """Safe division returning default on zero/null denominator."""
    try:
        if den == 0 or den is None or (isinstance(den, float) and np.isnan(den)):
            return default
        return num / den
    except Exception:
        return default


def _coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(0.0)


def _clean_item_num(s) -> str:
    """Normalize item numbers: strip whitespace, uppercase, remove leading zeros."""
    if pd.isna(s):
        return ""
    return str(s).strip().upper().lstrip("0") or "0"


def _detect_snapshot_date(path: Path) -> str:
    """Extract date from filename like Inventory_Transform_051126.xlsx → 051126."""
    stem = path.stem
    m = re.search(r'(\d{6})', stem)
    if m:
        raw = m.group(1)
        try:
            return datetime.strptime(raw, "%m%d%y").strftime("%m/%d/%Y")
        except ValueError:
            pass
    return datetime.now().strftime("%m/%d/%Y")


def _read_xlsb_xref(path: Path, state_filter: bool = True) -> pd.DataFrame:
    """
    Read HD or Lowe's xref xlsb.
    If state_filter=True, keep only rows where state/zip indicates Oregon.
    Returns DataFrame with columns: [corp_item, vn_item, store_state, channel]
    """
    try:
        import pyxlsb
        df = pd.read_excel(path, engine="pyxlsb")
    except ImportError:
        try:
            df = pd.read_excel(path, engine="openpyxl")
        except Exception as e:
            print(f"  WARNING: Could not read xref {path.name}: {e}")
            return pd.DataFrame(columns=["corp_item", "vn_item", "store_state", "channel"])

    df.columns = [str(c).strip() for c in df.columns]

    # Detect state column
    state_col = None
    for col in df.columns:
        if col.upper() in ("STATE", "ST", "STORE_STATE", "STORE STATE", "SHIP_STATE"):
            state_col = col
            break

    if state_filter and state_col:
        df = df[df[state_col].astype(str).str.upper().isin({"OR", "OREGON"})]

    # Normalize item columns
    for col in df.columns:
        if "ITEM" in col.upper() or "SKU" in col.upper():
            df[col] = df[col].apply(_clean_item_num)

    return df


# ─────────────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────────────

def _load_inventory(path: Path) -> pd.DataFrame:
    """
    Load Inventory Transform xlsx.
    Expected sheet: 'Transform' or first sheet.
    Key columns: Item, Description, On Hand, Available, Committed, etc.
    """
    print(f"  Loading inventory: {path.name}")
    try:
        xl = pd.ExcelFile(path, engine="openpyxl")
        sheet = "Transform" if "Transform" in xl.sheet_names else xl.sheet_names[0]
        df = pd.read_excel(xl, sheet_name=sheet, dtype=str)
    except Exception as e:
        print(f"  ERROR loading inventory: {e}")
        return pd.DataFrame()

    df.columns = [str(c).strip() for c in df.columns]

    # Normalize numeric columns
    num_cols = ["On Hand", "Available", "Committed", "On Order", "OH", "Avail"]
    for col in df.columns:
        for nc in num_cols:
            if nc.upper() in col.upper():
                df[col] = _coerce_numeric(df[col])
                break

    # Normalize item numbers
    for col in df.columns:
        if col.upper() in ("ITEM", "ITEM NO", "ITEM NUMBER", "SKU", "ITEM_NO"):
            df["_item_key"] = df[col].apply(_clean_item_num)
            break
    else:
        if len(df.columns) > 0:
            df["_item_key"] = df.iloc[:, 0].apply(_clean_item_num)

    print(f"    → {len(df):,} rows, {len(df.columns)} cols")
    return df


def _load_ytd_sales(path: Path) -> pd.DataFrame:
    """
    Load 2026 Sales by Item xlsx.
    Expected: Item, Description, Customer/Channel columns, monthly sales (Jan–May).
    """
    print(f"  Loading YTD sales: {path.name}")
    try:
        xl = pd.ExcelFile(path, engine="openpyxl")
        # Try to find the right sheet
        target_sheets = [s for s in xl.sheet_names
                         if any(kw in s.upper() for kw in ["SALES", "DATA", "DETAIL", "ITEM"])]
        sheet = target_sheets[0] if target_sheets else xl.sheet_names[0]
        df = pd.read_excel(xl, sheet_name=sheet, dtype=str)
    except Exception as e:
        print(f"  ERROR loading YTD sales: {e}")
        return pd.DataFrame()

    df.columns = [str(c).strip() for c in df.columns]

    # Normalize item numbers
    for col in df.columns:
        if col.upper() in ("ITEM", "ITEM NO", "ITEM NUMBER", "SKU"):
            df["_item_key"] = df[col].apply(_clean_item_num)
            break
    else:
        if len(df.columns) > 0:
            df["_item_key"] = df.iloc[:, 0].apply(_clean_item_num)

    print(f"    → {len(df):,} rows")
    return df


def _load_sales_plan(path: Path) -> pd.DataFrame:
    """
    Load 2026 Sales Plan by Item xlsx.
    This is the SHARED file used by both NOR CAL and OR pipelines.
    Filter to OR accounts after loading.
    """
    print(f"  Loading sales plan: {path.name}")
    try:
        xl = pd.ExcelFile(path, engine="openpyxl")
        sheet_names = xl.sheet_names
        print(f"    Sheets: {sheet_names[:5]}")

        # Look for an OR-specific sheet first
        or_sheets = [s for s in sheet_names if "OR" in s.upper() and "CORP" not in s.upper()]
        main_sheets = [s for s in sheet_names
                       if any(kw in s.upper() for kw in ["PLAN", "SALES", "DATA", "DETAIL"])]

        if or_sheets:
            sheet = or_sheets[0]
            print(f"    → Using OR sheet: {sheet}")
        elif main_sheets:
            sheet = main_sheets[0]
            print(f"    → Using main sheet: {sheet}")
        else:
            sheet = sheet_names[0]

        df = pd.read_excel(xl, sheet_name=sheet, dtype=str)
    except Exception as e:
        print(f"  ERROR loading sales plan: {e}")
        return pd.DataFrame()

    df.columns = [str(c).strip() for c in df.columns]

    # Normalize item numbers
    for col in df.columns:
        if col.upper() in ("ITEM", "ITEM NO", "ITEM NUMBER", "SKU"):
            df["_item_key"] = df[col].apply(_clean_item_num)
            break
    else:
        if len(df.columns) > 0:
            df["_item_key"] = df.iloc[:, 0].apply(_clean_item_num)

    # Filter to OR-relevant rows if there's a region/state column
    for col in df.columns:
        if col.upper() in ("REGION", "STATE", "TERRITORY", "MARKET"):
            or_mask = df[col].astype(str).str.upper().isin({"OR", "OREGON", "NORTHWEST", "PNW"})
            if or_mask.sum() > 0:
                df = df[or_mask]
                print(f"    → Filtered to OR rows: {len(df):,}")
                break

    print(f"    → {len(df):,} rows loaded")
    return df


def _load_v158(path: Path) -> pd.DataFrame:
    """Load Key Item Report V158 — defines the Key Item universe."""
    print(f"  Loading V158 Key Item report: {path.name}")
    try:
        df = pd.read_excel(path, engine="openpyxl", dtype=str)
        df.columns = [str(c).strip() for c in df.columns]
        for col in df.columns:
            if col.upper() in ("ITEM", "ITEM NO", "ITEM NUMBER", "SKU"):
                df["_item_key"] = df[col].apply(_clean_item_num)
                break
        print(f"    → {len(df):,} Key Items")
        return df
    except Exception as e:
        print(f"  WARNING: Could not load V158: {e}")
        return pd.DataFrame()


def _load_hist_parquet(cache_dir: Path, region: str = "or") -> pd.DataFrame | None:
    """
    Load historical sales parquet cache for OR.
    Falls back to NOR CAL cache if OR cache doesn't exist (uses same data, filters later).
    """
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Try OR-specific cache first
    for fname in [f"hist_{region}_2023.parquet", f"hist_{region}_2024.parquet",
                  f"hist_{region}_2025.parquet"]:
        p = cache_dir / fname
        if p.exists():
            print(f"    → Found OR cache: {fname}")

    # Fall back to norcal cache in parent dir
    norcal_cache = cache_dir.parent / "cache"
    or_frames = []
    for year in [2023, 2024, 2025]:
        # Try OR-specific first
        or_p  = cache_dir / f"hist_or_{year}.parquet"
        nc_p  = norcal_cache / f"hist_norcal_{year}.parquet"

        if or_p.exists():
            try:
                df = pd.read_parquet(or_p)
                df["_hist_year"] = year
                or_frames.append(df)
                print(f"    → Loaded OR hist {year}: {len(df):,} rows")
            except Exception as e:
                print(f"    WARNING: Could not load {or_p}: {e}")
        elif nc_p.exists():
            # NOR CAL cache is West Coast sales — filter to OR-relevant items
            try:
                df = pd.read_parquet(nc_p)
                df["_hist_year"] = year
                or_frames.append(df)
                print(f"    → Loaded NorCal hist {year} (will filter to OR items): {len(df):,} rows")
            except Exception as e:
                print(f"    WARNING: Could not load {nc_p}: {e}")

    if or_frames:
        return pd.concat(or_frames, ignore_index=True)
    return None


# ─────────────────────────────────────────────────────
# CORE COMPUTATION
# ─────────────────────────────────────────────────────

def _build_ki_master(plan: pd.DataFrame, v158: pd.DataFrame, ytd: pd.DataFrame) -> pd.DataFrame:
    """
    Build the master KI universe for OR.
    Joins plan + V158 + any KI in YTD actuals.
    Returns DataFrame with one row per KI, key columns:
      _item_key, description, customer, plan_units, plan_dollars
    """
    frames = []

    if not plan.empty and "_item_key" in plan.columns:
        frames.append(plan[["_item_key"]].drop_duplicates())
    if not v158.empty and "_item_key" in v158.columns:
        frames.append(v158[["_item_key"]].drop_duplicates())
    if not ytd.empty and "_item_key" in ytd.columns:
        frames.append(ytd[["_item_key"]].drop_duplicates())

    if not frames:
        return pd.DataFrame(columns=["_item_key"])

    ki_master = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["_item_key"])
    ki_master = ki_master[ki_master["_item_key"].str.len() > 0]

    # Attach description from V158 if available
    if not v158.empty:
        desc_cols = [c for c in v158.columns if "DESC" in c.upper() or "NAME" in c.upper()]
        if desc_cols and "_item_key" in v158.columns:
            desc_df = v158[["_item_key", desc_cols[0]]].drop_duplicates("_item_key")
            desc_df.columns = ["_item_key", "description"]
            ki_master = ki_master.merge(desc_df, on="_item_key", how="left")

    if "description" not in ki_master.columns:
        ki_master["description"] = ""

    ki_master["region"] = REGION_LABEL
    return ki_master.reset_index(drop=True)


def _compute_ytd(ytd_raw: pd.DataFrame, plan_raw: pd.DataFrame,
                 ki_master: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Compute YTD actual vs plan vs miss.
    Returns (ytd_actual, ytd_plan, ytd_miss) DataFrames.
    """
    month_cols_actual = []
    month_cols_plan   = []

    # Detect month columns (Jan–May)
    month_names = ["JAN", "FEB", "MAR", "APR", "MAY",
                   "JANUARY", "FEBRUARY", "MARCH", "APRIL"]
    month_nums  = ["1", "2", "3", "4", "5",
                   "01", "02", "03", "04", "05",
                   "M1", "M2", "M3", "M4", "M5"]

    for col in ytd_raw.columns:
        cu = col.upper()
        if any(m in cu for m in month_names) or any(cu == m for m in month_nums):
            month_cols_actual.append(col)

    for col in plan_raw.columns:
        cu = col.upper()
        if any(m in cu for m in month_names) or any(cu == m for m in month_nums):
            month_cols_plan.append(col)

    # Build per-KI YTD actual
    ytd_actual = pd.DataFrame({"_item_key": ki_master["_item_key"]})
    ytd_plan_df= pd.DataFrame({"_item_key": ki_master["_item_key"]})

    if "_item_key" in ytd_raw.columns and month_cols_actual:
        ytd_grp = ytd_raw.groupby("_item_key")[month_cols_actual].sum().reset_index()
        ytd_grp["ytd_actual_units"] = ytd_grp[month_cols_actual].sum(axis=1)
        ytd_actual = ytd_actual.merge(
            ytd_grp[["_item_key", "ytd_actual_units"]], on="_item_key", how="left"
        )
    if "ytd_actual_units" not in ytd_actual.columns:
        ytd_actual["ytd_actual_units"] = 0.0
    ytd_actual["ytd_actual_units"] = _coerce_numeric(ytd_actual["ytd_actual_units"])

    if "_item_key" in plan_raw.columns and month_cols_plan:
        plan_grp = plan_raw.groupby("_item_key")[month_cols_plan].sum().reset_index()
        # Only sum YTD months (Jan–May = indices 0–4)
        ytd_plan_cols = month_cols_plan[:len(YTD_MONTHS)]
        if ytd_plan_cols:
            plan_grp["ytd_plan_units"] = plan_grp[ytd_plan_cols].sum(axis=1)
            ytd_plan_df = ytd_plan_df.merge(
                plan_grp[["_item_key", "ytd_plan_units"]], on="_item_key", how="left"
            )
    if "ytd_plan_units" not in ytd_plan_df.columns:
        ytd_plan_df["ytd_plan_units"] = 0.0
    ytd_plan_df["ytd_plan_units"] = _coerce_numeric(ytd_plan_df["ytd_plan_units"])

    # Compute miss
    ytd_miss = ki_master[["_item_key"]].copy()
    ytd_miss = ytd_miss.merge(ytd_actual[["_item_key", "ytd_actual_units"]], on="_item_key", how="left")
    ytd_miss = ytd_miss.merge(ytd_plan_df[["_item_key", "ytd_plan_units"]],  on="_item_key", how="left")
    ytd_miss["ytd_actual_units"] = _coerce_numeric(ytd_miss["ytd_actual_units"])
    ytd_miss["ytd_plan_units"]   = _coerce_numeric(ytd_miss["ytd_plan_units"])
    ytd_miss["ytd_miss_units"]   = ytd_miss["ytd_actual_units"] - ytd_miss["ytd_plan_units"]
    ytd_miss["ytd_miss_pct"]     = ytd_miss.apply(
        lambda r: _safe_div(r["ytd_miss_units"], r["ytd_plan_units"]), axis=1
    )

    return ytd_actual, ytd_plan_df, ytd_miss


def _compute_forward(plan_raw: pd.DataFrame, inv_raw: pd.DataFrame,
                     ki_master: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Compute forward-looking plan (Jun–Dec) vs available inventory.
    Returns (fwd_plan, fwd_inv, fwd_gap).
    """
    fwd_plan = pd.DataFrame({"_item_key": ki_master["_item_key"]})
    fwd_inv  = pd.DataFrame({"_item_key": ki_master["_item_key"]})

    # Forward plan months
    fwd_month_names = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
                       "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER",
                       "NOVEMBER", "DECEMBER"]
    fwd_month_nums  = ["6", "7", "8", "9", "10", "11", "12",
                       "06", "07", "08", "09", "M6", "M7", "M8", "M9"]

    fwd_cols_plan = []
    for col in plan_raw.columns:
        cu = col.upper()
        if any(m in cu for m in fwd_month_names) or any(cu == m for m in fwd_month_nums):
            fwd_cols_plan.append(col)

    if "_item_key" in plan_raw.columns and fwd_cols_plan:
        plan_grp = plan_raw.groupby("_item_key")[fwd_cols_plan].sum().reset_index()
        plan_grp["fwd_plan_units"] = plan_grp[fwd_cols_plan].sum(axis=1)
        fwd_plan = fwd_plan.merge(
            plan_grp[["_item_key", "fwd_plan_units"]], on="_item_key", how="left"
        )
    if "fwd_plan_units" not in fwd_plan.columns:
        fwd_plan["fwd_plan_units"] = 0.0
    fwd_plan["fwd_plan_units"] = _coerce_numeric(fwd_plan["fwd_plan_units"])

    # Available inventory
    avail_col = None
    for col in inv_raw.columns:
        cu = col.upper()
        if cu in ("AVAILABLE", "AVAIL", "NET AVAILABLE", "NET_AVAIL", "ON HAND", "OH"):
            avail_col = col
            break

    if avail_col and "_item_key" in inv_raw.columns:
        inv_grp = inv_raw.groupby("_item_key")[avail_col].sum().reset_index()
        inv_grp.columns = ["_item_key", "inv_available"]
        fwd_inv = fwd_inv.merge(inv_grp, on="_item_key", how="left")
    if "inv_available" not in fwd_inv.columns:
        fwd_inv["inv_available"] = 0.0
    fwd_inv["inv_available"] = _coerce_numeric(fwd_inv["inv_available"])

    # Gap = available inventory - forward plan
    fwd_gap = ki_master[["_item_key"]].copy()
    fwd_gap = fwd_gap.merge(fwd_plan[["_item_key", "fwd_plan_units"]], on="_item_key", how="left")
    fwd_gap = fwd_gap.merge(fwd_inv[["_item_key", "inv_available"]],  on="_item_key", how="left")
    fwd_gap["fwd_plan_units"] = _coerce_numeric(fwd_gap["fwd_plan_units"])
    fwd_gap["inv_available"]  = _coerce_numeric(fwd_gap["inv_available"])
    fwd_gap["fwd_gap_units"]  = fwd_gap["inv_available"] - fwd_gap["fwd_plan_units"]
    fwd_gap["fwd_gap_pct"]    = fwd_gap.apply(
        lambda r: _safe_div(r["fwd_gap_units"], r["fwd_plan_units"]), axis=1
    )
    fwd_gap["coverage_flag"]  = fwd_gap["fwd_gap_units"].apply(
        lambda x: "COVERED" if x >= 0 else "SHORT"
    )

    return fwd_plan, fwd_inv, fwd_gap


def _compute_excess(inv_raw: pd.DataFrame, plan_raw: pd.DataFrame,
                    ki_master: pd.DataFrame) -> pd.DataFrame:
    """
    Identify KIs with inventory exceeding full-year plan (excess at farm).
    Returns DataFrame with excess_units and reason_code.
    """
    excess = ki_master[["_item_key"]].copy()

    # Total plan (all months)
    plan_num_cols = []
    for col in plan_raw.columns:
        try:
            v = pd.to_numeric(plan_raw[col], errors="coerce")
            if v.notna().sum() > len(plan_raw) * 0.3:
                plan_num_cols.append(col)
        except Exception:
            pass

    # Exclude the item key column from numeric cols
    if "_item_key" in plan_num_cols:
        plan_num_cols.remove("_item_key")

    if "_item_key" in plan_raw.columns and plan_num_cols:
        plan_grp = plan_raw.groupby("_item_key")[plan_num_cols].sum().reset_index()
        plan_grp["total_plan_units"] = plan_grp[plan_num_cols].sum(axis=1)
        excess = excess.merge(
            plan_grp[["_item_key", "total_plan_units"]], on="_item_key", how="left"
        )
    if "total_plan_units" not in excess.columns:
        excess["total_plan_units"] = 0.0
    excess["total_plan_units"] = _coerce_numeric(excess["total_plan_units"])

    # Total available inventory
    avail_col = None
    for col in inv_raw.columns:
        if col.upper() in ("AVAILABLE", "AVAIL", "NET_AVAIL", "ON HAND", "OH"):
            avail_col = col
            break

    if avail_col and "_item_key" in inv_raw.columns:
        inv_grp = inv_raw.groupby("_item_key")[avail_col].sum().reset_index()
        inv_grp.columns = ["_item_key", "inv_available"]
        excess = excess.merge(inv_grp, on="_item_key", how="left")
    if "inv_available" not in excess.columns:
        excess["inv_available"] = 0.0
    excess["inv_available"] = _coerce_numeric(excess["inv_available"])

    # Excess = inventory - total plan
    excess["excess_units"] = excess["inv_available"] - excess["total_plan_units"]
    excess = excess[excess["excess_units"] > 0].copy()
    excess["excess_pct"] = excess.apply(
        lambda r: _safe_div(r["excess_units"], r["total_plan_units"]), axis=1
    )
    # Reason codes
    excess["reason_code"] = excess["excess_pct"].apply(
        lambda x: "OVER >100%" if x > 1.0
        else ("OVER 50-100%" if x > 0.5
        else "OVER 10-50%")
    )
    return excess.sort_values("excess_units", ascending=False).reset_index(drop=True)


def _compute_channel_summary(ytd_miss: pd.DataFrame, fwd_gap: pd.DataFrame,
                              plan_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Build channel/customer summary for OR.
    Attempts to find customer-level breakdowns from the plan data.
    """
    # Try to find customer column in plan
    cust_col = None
    for col in plan_raw.columns:
        cu = col.upper()
        if cu in ("CUSTOMER", "ACCOUNT", "CHANNEL", "CHAIN", "RETAILER"):
            cust_col = col
            break

    if cust_col is None:
        # Build a synthetic channel summary from known OR customers
        channels = list(CHANNEL_MAP.values())
        channel_df = pd.DataFrame({
            "customer": channels,
            "region":   [REGION_LABEL] * len(channels),
            "ytd_plan_units":   [0.0] * len(channels),
            "ytd_actual_units": [0.0] * len(channels),
            "ytd_miss_units":   [0.0] * len(channels),
            "fwd_plan_units":   [0.0] * len(channels),
            "inv_available":    [0.0] * len(channels),
            "fwd_gap_units":    [0.0] * len(channels),
        })
        return channel_df

    # Aggregate by customer
    plan_agg = plan_raw.groupby(cust_col).agg(
        ytd_plan_units=pd.NamedAgg(
            column=plan_raw.columns[2] if len(plan_raw.columns) > 2 else plan_raw.columns[0],
            aggfunc="sum"
        )
    ).reset_index()
    plan_agg.columns = ["customer", "ytd_plan_units"]
    plan_agg["ytd_plan_units"] = _coerce_numeric(plan_agg["ytd_plan_units"])
    plan_agg["region"] = REGION_LABEL

    return plan_agg


def _build_walk_tables(ytd_miss: pd.DataFrame, fwd_gap: pd.DataFrame) -> tuple[dict, dict, dict]:
    """
    Build YE / Forward / YTD walk tables (same structure as NOR CAL exec summary walks).
    """
    total_ytd_plan    = _coerce_numeric(ytd_miss.get("ytd_plan_units",   pd.Series([0]))).sum()
    total_ytd_actual  = _coerce_numeric(ytd_miss.get("ytd_actual_units", pd.Series([0]))).sum()
    total_ytd_miss    = total_ytd_actual - total_ytd_plan

    total_fwd_plan    = _coerce_numeric(fwd_gap.get("fwd_plan_units",  pd.Series([0]))).sum()
    total_fwd_inv     = _coerce_numeric(fwd_gap.get("inv_available",   pd.Series([0]))).sum()
    total_fwd_gap     = total_fwd_inv - total_fwd_plan

    total_ye_plan     = total_ytd_plan + total_fwd_plan
    total_ye_proj     = total_ytd_actual + max(total_fwd_inv, 0)
    total_ye_gap      = total_ye_proj - total_ye_plan

    walk_ytd = {
        "label":   "YTD Performance (Jan–May)",
        "plan":    round(float(total_ytd_plan),   0),
        "actual":  round(float(total_ytd_actual), 0),
        "miss":    round(float(total_ytd_miss),   0),
        "pct":     round(_safe_div(total_ytd_miss, total_ytd_plan), 4),
    }
    walk_fwd = {
        "label":   "Forward Outlook (Jun–Dec)",
        "plan":    round(float(total_fwd_plan), 0),
        "inv":     round(float(total_fwd_inv),  0),
        "gap":     round(float(total_fwd_gap),  0),
        "pct":     round(_safe_div(total_fwd_gap, total_fwd_plan), 4),
    }
    walk_ye = {
        "label":   "Year-End Projection",
        "plan":    round(float(total_ye_plan), 0),
        "proj":    round(float(total_ye_proj), 0),
        "gap":     round(float(total_ye_gap),  0),
        "pct":     round(_safe_div(total_ye_gap, total_ye_plan), 4),
    }
    return walk_ye, walk_fwd, walk_ytd


def _compute_kpis(d: DataObject) -> dict:
    """Compute exec-summary KPIs from the data object."""
    kpis = {}

    if d.ytd_miss is not None:
        miss = d.ytd_miss
        kpis["total_ki_count"]    = len(miss)
        kpis["ki_below_plan"]     = int((miss["ytd_miss_units"] < 0).sum())
        kpis["ki_on_plan"]        = int((miss["ytd_miss_units"] >= 0).sum())
        kpis["ytd_miss_units"]    = round(float(miss["ytd_miss_units"].sum()), 0)
        kpis["ytd_plan_units"]    = round(float(miss["ytd_plan_units"].sum()), 0)
        kpis["ytd_actual_units"]  = round(float(miss["ytd_actual_units"].sum()), 0)
        kpis["ytd_achievement_pct"] = round(
            _safe_div(kpis["ytd_actual_units"], kpis["ytd_plan_units"]) * 100, 1
        )

    if d.fwd_gap is not None:
        gap = d.fwd_gap
        kpis["fwd_plan_units"]    = round(float(gap["fwd_plan_units"].sum()), 0)
        kpis["fwd_inv_available"] = round(float(gap["inv_available"].sum()), 0)
        kpis["fwd_gap_units"]     = round(float(gap["fwd_gap_units"].sum()), 0)
        kpis["ki_short_fwd"]      = int((gap["fwd_gap_units"] < 0).sum())
        kpis["ki_covered_fwd"]    = int((gap["fwd_gap_units"] >= 0).sum())

    if d.excess is not None:
        kpis["ki_excess_count"]   = len(d.excess)
        kpis["total_excess_units"]= round(float(d.excess["excess_units"].sum()), 0)

    kpis["region"]         = REGION_LABEL
    kpis["snapshot_date"]  = d.snapshot_date
    kpis["ytd_months"]     = "Jan–May"
    kpis["fwd_months"]     = "Jun–Dec"

    return kpis


# ─────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────

def run():
    """
    Main pipeline entry point.
    Loads all source files, runs the model, populates global d object.
    Called by build_or_workbook_patched.py after setting PATH_* constants.
    """
    global d
    d = DataObject()

    print(f"\n{'='*60}")
    print(f"  Everde OR Sales Plan Model — {REGION_LABEL}")
    print(f"  Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Detect snapshot date from inventory filename
    d.snapshot_date = _detect_snapshot_date(PATH_INV)
    print(f"  Snapshot date: {d.snapshot_date}\n")

    # Validate required files
    required = {
        "Inventory Transform": PATH_INV,
        "YTD Sales":           PATH_YTD,
    }
    missing = []
    for label, p in required.items():
        if not Path(p).exists():
            missing.append(f"  MISSING: {label} → {p}")
    if missing:
        for m in missing:
            print(m)
        print("\nERROR: Required input files not found. Aborting.")
        sys.exit(1)

    # Load data
    print("Loading source data...")
    inv_raw  = _load_inventory(PATH_INV)
    ytd_raw  = _load_ytd_sales(PATH_YTD)
    plan_raw = _load_sales_plan(PATH_PLAN) if Path(PATH_PLAN).exists() else pd.DataFrame()
    v158     = _load_v158(PATH_V158)       if Path(PATH_V158).exists() else pd.DataFrame()

    if plan_raw.empty:
        print(f"  WARNING: Sales plan not found at {PATH_PLAN} — using YTD data only")
        d.warnings.append("Sales plan file not found — forward plan metrics will be zero")

    # Record row counts
    d.row_counts = {
        "inventory": len(inv_raw),
        "ytd_sales":  len(ytd_raw),
        "sales_plan": len(plan_raw),
        "v158":       len(v158),
    }

    # Sync item keys across all frames
    if not plan_raw.empty and "_item_key" not in plan_raw.columns:
        plan_raw["_item_key"] = plan_raw.iloc[:, 0].apply(_clean_item_num)
    if not ytd_raw.empty and "_item_key" not in ytd_raw.columns:
        ytd_raw["_item_key"] = ytd_raw.iloc[:, 0].apply(_clean_item_num)
    if not inv_raw.empty and "_item_key" not in inv_raw.columns:
        inv_raw["_item_key"] = inv_raw.iloc[:, 0].apply(_clean_item_num)

    # Build KI master
    print("\nBuilding OR Key Item universe...")
    d.ki_master = _build_ki_master(plan_raw, v158, ytd_raw)
    print(f"  → {len(d.ki_master):,} unique Key Items in OR universe")

    # YTD computation
    print("\nComputing YTD performance...")
    d.ytd_actual, d.ytd_plan, d.ytd_miss = _compute_ytd(ytd_raw, plan_raw, d.ki_master)
    below = int((d.ytd_miss["ytd_miss_units"] < 0).sum())
    print(f"  → {below} KIs below YTD plan")

    # Forward-looking computation
    print("\nComputing forward outlook (Jun–Dec)...")
    d.fwd_plan, d.fwd_inv, d.fwd_gap = _compute_forward(plan_raw, inv_raw, d.ki_master)
    short = int((d.fwd_gap["fwd_gap_units"] < 0).sum())
    print(f"  → {short} KIs short of forward plan")

    # Excess at farm
    print("\nComputing excess at farm...")
    d.excess = _compute_excess(inv_raw, plan_raw, d.ki_master)
    print(f"  → {len(d.excess)} KIs with excess inventory")

    # Channel summary
    print("\nBuilding channel summary...")
    d.channel = _compute_channel_summary(d.ytd_miss, d.fwd_gap, plan_raw)

    # Walk tables
    print("\nBuilding walk tables...")
    d.walk_ye, d.walk_fwd, d.walk_ytd = _build_walk_tables(d.ytd_miss, d.fwd_gap)

    # Top misses
    d.top_miss = d.ytd_miss.sort_values("ytd_miss_units", ascending=True).head(20)

    # KPIs
    d.kpis = _compute_kpis(d)

    print(f"\n{'='*60}")
    print(f"  OR Model complete.")
    print(f"  KIs: {d.kpis.get('total_ki_count', 0):,}  |  "
          f"Below plan: {d.kpis.get('ki_below_plan', 0):,}  |  "
          f"Fwd short: {d.kpis.get('ki_short_fwd', 0):,}")
    print(f"  YTD achievement: {d.kpis.get('ytd_achievement_pct', 0):.1f}%")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run()
    print("Done. Data object available as or_forward_patched.d")
