"""
build_norcal_workbook_patched.py
────────────────────────────────
Inject network share paths into nor_cal_forward, then build the NOR CAL
Forward Looking workbook for portal extract_sales_plan.py.

Usage:
    python build_norcal_workbook_patched.py
    python build_norcal_workbook_patched.py --inv "..." --ytd "..."
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

SHARE_BASE = Path(r"\\192.168.190.10\Claude Sandbox")
JS_FILES = SHARE_BASE / "JS Files"
SHARED = JS_FILES / "Shared"
XREF_DIR = SHARED / "Inventory Cross References"
WEEKLY_DROP = SHARE_BASE / "DataDrops" / "Sales Plan Review" / "WeeklyDrop"
DATADROPS = SHARE_BASE / "DataDrops" / "Sales Plan Review"
SALES_PLAN_DIR = SHARED / "Sales Plan"
SALES_DATA_DIR = SHARED / "Sales Data"
INV_DIR = SHARED / "INV"

BASE = Path(__file__).parent


def parse_args():
    p = argparse.ArgumentParser(description="Everde NOR CAL workbook builder")
    p.add_argument("--inv", default=None, help="Inventory Transform xlsx")
    p.add_argument("--ytd", default=None, help="2026 Sales by Item xlsx")
    p.add_argument("--out", default=None, help="Output xlsx path")
    p.add_argument("--no-share", action="store_true", help="Skip copy to DataDrops share")
    return p.parse_args()


def find_latest(folder: Path | list[Path], patterns: list[str]) -> Path | None:
    folders = folder if isinstance(folder, list) else [folder]
    hits: list[Path] = []
    for root in folders:
        if not root.exists():
            continue
        for pat in patterns:
            hits.extend(root.glob(pat))
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def resolve_paths(args):
    inv = Path(args.inv) if args.inv and Path(args.inv).exists() else find_latest(
        WEEKLY_DROP,
        ["Inventory Transform*.xlsx", "Inventory_Transform*.xlsx", "*Inventory*Transform*.xlsx"],
    )
    if not inv:
        inv = find_latest(INV_DIR, ["Inventory Transform*.xlsx", "Inventory_Transform*.xlsx"])

    ytd = Path(args.ytd) if args.ytd and Path(args.ytd).exists() else find_latest(
        WEEKLY_DROP,
        ["2026 Sales by Item*.xlsx", "2026_Sales_by_Item*.xlsx", "*Sales by Item*.xlsx"],
    )
    if not ytd:
        ytd = find_latest(SALES_DATA_DIR, ["2026 Sales by Item*.xlsx"])

    plan = find_latest(
        [SALES_PLAN_DIR, BASE, JS_FILES / "Sales Plan Review"],
        ["2026 Sales Plan by Item.xlsx", "2026_Sales_Plan_by_Item.xlsx"],
    )
    v158 = find_latest(
        [XREF_DIR, BASE],
        ["Key Item Report V158.xlsx", "Key Item Report - Ending*.xlsx", "Key_Item_Report_V158.xlsx"],
    )
    hd = find_latest(XREF_DIR, ["Home Depot Corp-VN*xref*.xlsb", "Home_Depot*xref*.xlsb"])
    lowes = find_latest(XREF_DIR, ["LOWE*xref*.xlsb", "LOWE_S_xref*.xlsb"])

    today = datetime.now().strftime("%m%d%y")
    out_name = f"NOR_CAL_Forward_Looking_INV_vs_Sales_Plan_{today}.xlsx"
    out_path = Path(args.out) if args.out else BASE / out_name

    return {
        "inv": inv,
        "ytd": ytd,
        "plan": plan,
        "v158": v158,
        "hd": hd,
        "lowes": lowes,
        "out": out_path,
        "cache": BASE / "cache",
    }


def snap_date_from_inv(inv: Path) -> pd.Timestamp:
    digits = "".join(c for c in inv.stem if c.isdigit())[-6:]
    if len(digits) == 6:
        mm, dd, yy = digits[:2], digits[2:4], digits[4:]
        return pd.Timestamp(f"20{yy}-{mm}-{dd}")
    return pd.Timestamp(datetime.now().date())


def load_patched_model(paths: dict):
    spec = importlib.util.spec_from_file_location("nor_cal_forward", BASE / "nor_cal_forward.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("nor_cal_forward.py not found")
    M = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(M)

    M.PROJECT_DIR = BASE
    M.KEY_ITEM_DIR = BASE
    M.SHARED_DIR = JS_FILES
    M.CACHE_DIR = paths["cache"]
    M.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    M.PATH_INV = paths["inv"]
    M.PATH_YTD = paths["ytd"]
    M.PATH_PLAN = paths["plan"]
    M.PATH_V158 = paths["v158"]
    M.PATH_HD_XREF = paths["hd"]
    M.PATH_LOWES_XREF = paths["lowes"]
    M.PATH_HIST = {
        2023: SALES_DATA_DIR / "2023 Sales by Item.xlsx",
        2024: SALES_DATA_DIR / "2024 Sales by Item.xlsx",
        2025: SALES_DATA_DIR / "2025 Sales by Item.xlsx",
    }
    M.PATH_GROW_TIMES = SHARED / "Misc Look Ups" / "Prod lookups ALL 091925.xlsx"

    snap = snap_date_from_inv(paths["inv"])
    M.SNAP_DATE = snap
    M.PRIOR_SNAP_DATE = snap - pd.Timedelta(days=7)
    snap_month = int(snap.month)
    M.YTD_MONTHS = list(range(1, snap_month))
    M.FWD_MONTHS = list(range(snap_month, 13))

    sys.modules["nor_cal_forward"] = M
    return M


def load_builder(paths: dict):
    spec = importlib.util.spec_from_file_location("build_norcal_workbook", BASE / "build_norcal_workbook.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("build_norcal_workbook.py not found")
    B = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(B)
    B.PROJECT_DIR = BASE
    B.ARCHIVE_DIR = BASE / "Archive"
    B.OUT_PATH = paths["out"]
    return B


def main():
    args = parse_args()
    paths = resolve_paths(args)

    print("=" * 60)
    print("Everde NOR CAL Workbook Builder (patched paths)")
    print("=" * 60)
    for key in ("inv", "ytd", "plan", "v158", "hd", "lowes", "out"):
        val = paths[key]
        ok = val and Path(val).exists()
        print(f"  {key:<6} {'OK' if ok else 'MISSING':<8} {val}")
    print()

    for req in ("inv", "ytd", "plan", "v158", "hd", "lowes"):
        if not paths[req] or not Path(paths[req]).exists():
            print(f"ERROR: Required file missing: {req}")
            sys.exit(1)

    load_patched_model(paths)
    builder = load_builder(paths)
    builder.main()

    out_path = Path(paths["out"])
    if not out_path.exists():
        print(f"ERROR: Expected output missing: {out_path}")
        sys.exit(1)

    if not args.no_share:
        try:
            DATADROPS.mkdir(parents=True, exist_ok=True)
            share_out = DATADROPS / out_path.name
            shutil.copy2(out_path, share_out)
            print(f"Copied to share: {share_out}")
        except OSError as exc:
            print(f"WARNING: Could not copy to share: {exc}")

    print(f"\nDONE. Workbook: {out_path}")
    return out_path


if __name__ == "__main__":
    main()
