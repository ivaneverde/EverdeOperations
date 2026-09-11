#!/usr/bin/env python3
"""
Build Juanita's Everde Freight Data YTD workbook from an Oracle Load Board dump.

Oracle xlsx is pasted into Raw Data columns C:AN (the 38 source columns).
Columns A:B and AO:BP are Juanita's formulas (week/month, ship type, miles, costs).
Other tabs are pivot tables + Lookup Tab + Truck Capacity; those stay from the template
and are refreshed after the paste.

Usage:
    python scripts/freight/build_load_board.py --source "path.xlsx"
    python scripts/freight/build_load_board.py --from-archive
    python scripts/freight/build_load_board.py --from-archive --force
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

XL_UP = -4162
XL_CALC_MANUAL = -4135
XL_CALC_AUTOMATIC = -4105

ORACLE_HEADER_ROW = 12  # 0-based; row 13 in Excel
VALUE_FIRST_COL = 3  # C
VALUE_LAST_COL = 40  # AN
FORMULA_LEFT = ("A", "B")
FORMULA_RIGHT = ("AO", "BP")

DEFAULT_DATA_ROOT = r"\\192.168.190.10\Claude Sandbox\DataDrops"
DEFAULT_JUANITA_SHARE = (
    r"\\VRD-AWSECS\Everde Central Share\Farms\Performance Reports"
    r"\Freight Load Board Reports\Load Board Reports\2026"
)
DEFAULT_SUFFIX = "with MAR-26 Rates with updated 26 BUD YE COSTS"
ORACLE_NAME_RE = re.compile(r"Freight_Load_Board", re.I)
STATE_NAME = "load-board-oracle.json"


def data_root() -> Path:
    import os

    root = os.environ.get("PORTAL_DATA_ROOT") or DEFAULT_DATA_ROOT
    return Path(str(root).replace("/", "\\").rstrip("\\"))


def weekly_drop() -> Path:
    import os

    override = os.environ.get("FREIGHT_WEEKLY_DROP")
    if override:
        return Path(str(override).replace("/", "\\").rstrip("\\"))
    return data_root() / "Freight" / "WeeklyDrop"


def archive_dir() -> Path:
    import os

    override = os.environ.get("FREIGHT_ORACLE_ARCHIVE")
    if override:
        return Path(str(override).replace("/", "\\").rstrip("\\"))
    return weekly_drop() / "archive"


def juanita_share() -> Path:
    import os

    override = os.environ.get("FREIGHT_SOURCE_DROP")
    if override:
        return Path(str(override).replace("/", "\\").rstrip("\\"))
    return Path(DEFAULT_JUANITA_SHARE)


def state_path() -> Path:
    repo = Path(__file__).resolve().parents[2]
    return repo / ".everde-scheduler" / STATE_NAME


def log(msg: str) -> None:
    print(msg, flush=True)


DATE_HEADERS = {"Actual Ship Date", "Schedule Ship Date", "Load Date"}
EXCEL_ERR_NA = -2146826246


def to_com(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (ValueError, TypeError):
        pass
    if isinstance(v, pd.Timestamp):
        dt = v.to_pydatetime()
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    if isinstance(v, datetime):
        return v.replace(tzinfo=None) if v.tzinfo else v
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        x = float(v)
        if np.isnan(x) or np.isinf(x):
            return None
        return x
    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
        return None
    return v


def excel_date_serial(v):
    """Midnight Excel serial so VLOOKUP against Lookup Tab dates is an exact match."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (ValueError, TypeError):
        pass
    ts = pd.to_datetime(v, errors="coerce")
    if pd.isna(ts):
        return None
    origin = pd.Timestamp("1899-12-30")
    return int((ts.normalize() - origin) / pd.Timedelta(days=1))


def is_excel_error(v) -> bool:
    if isinstance(v, int) and v <= -2146820000:
        return True
    if isinstance(v, str) and v.startswith("#"):
        return True
    return False


def find_newest_oracle(folder: Path) -> Path | None:
    if not folder.is_dir():
        return None
    files = [
        p
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in {".xlsx", ".xls"} and ORACLE_NAME_RE.search(p.name)
    ]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def find_newest_template(folders: list[Path], exclude_names: set[str] | None = None) -> Path | None:
    found: list[Path] = []
    skip = {n.lower() for n in (exclude_names or set())}
    for folder in folders:
        if not folder.is_dir():
            continue
        for p in folder.iterdir():
            if not p.is_file():
                continue
            name = p.name
            if name.lower() in skip:
                continue
            if not name.lower().endswith(".xlsb"):
                continue
            if not name.startswith("Everde Freight Data"):
                continue
            if "CALIFORNIA" in name.upper():
                continue
            found.append(p)
    if not found:
        return None
    return max(found, key=lambda p: p.stat().st_mtime)


def parse_as_of_from_oracle(path: Path) -> datetime:
    hdr = pd.read_excel(path, sheet_name=0, header=None, nrows=12)
    for i in range(len(hdr)):
        left = str(hdr.iloc[i, 0]).strip() if pd.notna(hdr.iloc[i, 0]) else ""
        if left.lower().startswith("actual ship date to"):
            raw = str(hdr.iloc[i, 1]).strip() if hdr.shape[1] > 1 and pd.notna(hdr.iloc[i, 1]) else ""
            raw = raw.lstrip(":").strip()
            for fmt in ("%d-%b-%y", "%d-%b-%Y", "%m/%d/%Y", "%Y-%m-%d"):
                try:
                    return datetime.strptime(raw, fmt)
                except ValueError:
                    continue
    df = pd.read_excel(path, sheet_name=0, header=ORACLE_HEADER_ROW, usecols=["Actual Ship Date"])
    mx = pd.to_datetime(df["Actual Ship Date"], errors="coerce").max()
    if pd.isna(mx):
        raise SystemExit("Could not determine Actual Ship Date To from Oracle dump")
    return mx.to_pydatetime()


def suffix_from_template(template: Path) -> str:
    m = re.search(r"\bwith\b.+$", template.stem, re.I)
    if m:
        return m.group(0).strip()
    return DEFAULT_SUFFIX


def output_name(as_of: datetime, template: Path) -> str:
    return f"Everde Freight Data YTD {as_of:%m-%d-%y} {suffix_from_template(template)}.xlsb"


def load_oracle_values(path: Path) -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_excel(path, sheet_name=0, header=ORACLE_HEADER_ROW)
    df = df.dropna(how="all")
    for col in df.columns:
        if str(col).strip() in DATE_HEADERS:
            df[col] = df[col].map(excel_date_serial)
    cols = [str(c) for c in df.columns]
    log(f"Oracle rows={len(df)} cols={len(cols)}")
    if len(df) < 10:
        raise SystemExit(f"Oracle dump looks empty: {path}")
    return df, cols


def validate_headers(oracle_cols: list[str], template_cols: list[str]) -> None:
    if len(oracle_cols) != len(template_cols):
        raise SystemExit(
            f"Column count mismatch: Oracle {len(oracle_cols)} vs template C:AN {len(template_cols)}"
        )
    mismatches = []
    for i, (a, b) in enumerate(zip(oracle_cols, template_cols)):
        if a.strip() != str(b).strip():
            mismatches.append(f"  col {i + 1}: oracle={a!r} template={b!r}")
    if mismatches:
        raise SystemExit("Raw Data C:AN headers do not match Oracle dump:\n" + "\n".join(mismatches))


def values_as_com_array(df: pd.DataFrame) -> list[list]:
    out: list[list] = []
    for row in df.itertuples(index=False, name=None):
        out.append([to_com(v) for v in row])
    return out


def col_headers(ws, first: int, last: int) -> list[str]:
    return [ws.Cells(1, c).Value for c in range(first, last + 1)]


def last_used_row(ws) -> int:
    used = ws.UsedRange
    used_last = int(used.Row + used.Rows.Count - 1)
    col_last = [
        int(ws.Cells(ws.Rows.Count, 3).End(XL_UP).Row),
        int(ws.Cells(ws.Rows.Count, 41).End(XL_UP).Row),
        int(ws.Cells(ws.Rows.Count, 1).End(XL_UP).Row),
    ]
    return max([used_last, *col_last])


def build_workbook(source: Path, template: Path, dest: Path, skip_pivots: bool = False) -> dict:
    import win32com.client as win32

    dest.parent.mkdir(parents=True, exist_ok=True)
    df, oracle_cols = load_oracle_values(source)
    n = len(df)
    last_data = n + 1  # header is row 1
    work_dir = Path(tempfile.mkdtemp(prefix="everde-load-board-"))
    local_book = work_dir / dest.name
    log(f"Copying template locally: {template.name}")
    shutil.copy2(template, local_book)

    excel = None
    wb = None
    stats: dict = {
        "source": str(source),
        "template": str(template),
        "output": str(dest),
        "rows": n,
    }
    try:
        excel = win32.DispatchEx("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.AskToUpdateLinks = False
        try:
            excel.ScreenUpdating = False
        except Exception:
            pass
        try:
            excel.EnableEvents = False
        except Exception:
            pass

        log(f"Opening {local_book}")
        wb = excel.Workbooks.Open(str(local_book), ReadOnly=False, UpdateLinks=0)
        try:
            excel.Calculation = XL_CALC_MANUAL
        except Exception as exc:
            log(f"Could not set manual calculation yet: {exc}")
        try:
            ws = wb.Worksheets("Raw Data")
        except Exception as exc:
            raise SystemExit(f"Template is missing 'Raw Data' tab: {exc}") from exc

        template_cols = col_headers(ws, VALUE_FIRST_COL, VALUE_LAST_COL)
        validate_headers(oracle_cols, template_cols)

        left_formulas = [ws.Range("A2").Formula, ws.Range("B2").Formula]
        right_formulas = []
        for c in range(41, 69):  # AO:BP
            right_formulas.append(ws.Cells(2, c).Formula)
        if not str(left_formulas[0]).startswith("=") or not str(right_formulas[0]).startswith("="):
            raise SystemExit("Template row 2 is missing Juanita formulas on A:B / AO:BP")

        old_last = last_used_row(ws)
        log(f"Template Raw Data last row={old_last}; writing {n} Oracle rows")

        if old_last > 1:
            ws.Range(f"A2:BP{old_last}").ClearContents()

        ws.Range("A2").Formula = left_formulas[0]
        ws.Range("B2").Formula = left_formulas[1]
        for i, formula in enumerate(right_formulas):
            ws.Cells(2, 41 + i).Formula = formula

        log("Pasting Oracle values into C:AN ...")
        data = values_as_com_array(df)
        chunk = 8000
        for i in range(0, len(data), chunk):
            part = data[i : i + chunk]
            r1 = 2 + i
            r2 = r1 + len(part) - 1
            log(f"  paste rows {r1}-{r2}")
            ws.Range(ws.Cells(r1, VALUE_FIRST_COL), ws.Cells(r2, VALUE_LAST_COL)).Value = part
        ws.Range(f"Q2:R{last_data}").NumberFormat = "MM/DD/YYYY"
        ws.Range(f"Z2:Z{last_data}").NumberFormat = "MM/DD/YYYY"

        log("Filling formulas A:B and AO:BP ...")
        if n > 1:
            ws.Range(f"A2:B{last_data}").FillDown()
            ws.Range(f"AO2:BP{last_data}").FillDown()

        if old_last > last_data:
            log(f"Deleting leftover template rows {last_data + 1}:{old_last}")
            ws.Range(f"{last_data + 1}:{old_last}").Delete()

        log("Calculating ...")
        excel.Calculation = XL_CALC_AUTOMATIC
        excel.CalculateUntilAsyncQueriesDone()

        if skip_pivots:
            log("Skipping pivot refresh (--skip-pivots)")
        else:
            log("Refreshing pivot tables ...")
            refreshed = 0
            failed = 0
            for sh in wb.Worksheets:
                try:
                    count = sh.PivotTables().Count
                except Exception:
                    count = 0
                for i in range(1, count + 1):
                    try:
                        sh.PivotTables(i).RefreshTable()
                        refreshed += 1
                    except Exception as exc:
                        failed += 1
                        log(f"  pivot refresh failed on {sh.Name!r} #{i}: {exc}")
            log(f"Pivots refreshed={refreshed} failed={failed}")
            excel.CalculateUntilAsyncQueriesDone()

        week_val = ws.Range("AO2").Value
        month_val = ws.Range("AP2").Value
        ship_val = ws.Range("AQ2").Value
        stats["sample_week"] = week_val
        stats["sample_month"] = month_val
        stats["sample_ship_type"] = ship_val
        stats["output_rows"] = last_used_row(ws) - 1
        log(f"Sample row2 WEEK={week_val!r} MONTH={month_val!r} SHIP TYPE={ship_val!r}")
        if is_excel_error(week_val) or is_excel_error(month_val) or not month_val:
            raise SystemExit(
                f"WEEK/MONTH formulas did not calculate (WEEK={week_val!r} MONTH={month_val!r}). "
                "Actual Ship Date likely did not match Lookup Tab dates."
            )

        excel.ScreenUpdating = True
        wb.Save()
        wb.Close(SaveChanges=True)
        wb = None
        log(f"Copying result to {dest}")
        shutil.copy2(local_book, dest)
        stats["output_size"] = dest.stat().st_size
        return stats
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        if excel is not None:
            try:
                excel.ScreenUpdating = True
                excel.EnableEvents = True
                excel.Calculation = XL_CALC_AUTOMATIC
                excel.Quit()
            except Exception:
                pass
        shutil.rmtree(work_dir, ignore_errors=True)


def fingerprint(path: Path) -> dict:
    st = path.stat()
    return {
        "name": path.name,
        "size": st.st_size,
        "mtime": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    }


def already_processed(source: Path, force: bool) -> bool:
    if force:
        return False
    sp = state_path()
    if not sp.is_file():
        return False
    try:
        prev = json.loads(sp.read_text(encoding="utf-8"))
    except Exception:
        return False
    now = fingerprint(source)
    return prev.get("source") == now


def save_state(source: Path, dest: Path, stats: dict) -> None:
    sp = state_path()
    sp.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": fingerprint(source),
        "output": fingerprint(dest),
        "rows": stats.get("rows"),
        "processedAt": datetime.now(timezone.utc).isoformat(),
    }
    sp.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    if args.from_archive:
        source = args.source and Path(args.source) or find_newest_oracle(archive_dir())
        if source is None:
            log(f"No Oracle Load Board xlsx in archive: {archive_dir()}")
            return 0
    else:
        if not args.source:
            raise SystemExit("--source is required unless --from-archive")
        source = Path(args.source)
    if not source.is_file():
        raise SystemExit(f"Oracle dump not found: {source}")

    if already_processed(source, args.force):
        log(f"Already processed {source.name} (same size/mtime). Use --force to rebuild.")
        return 0

    as_of = parse_as_of_from_oracle(source)
    out_dir = Path(args.output) if args.output else weekly_drop()
    planned_name = f"Everde Freight Data YTD {as_of:%m-%d-%y} {DEFAULT_SUFFIX}.xlsb"
    if args.template:
        template = Path(args.template)
    else:
        template = find_newest_template(
            [weekly_drop(), juanita_share()],
            exclude_names={planned_name},
        )
    if template is None or not template.is_file():
        raise SystemExit("No Everde Freight Data*.xlsb template found in WeeklyDrop or Juanita share")

    dest = out_dir / output_name(as_of, template)
    if not args.force and dest.is_file():
        if dest.stat().st_mtime >= source.stat().st_mtime and dest.stat().st_size > 1_000_000:
            log(f"Output already up to date vs dump: {dest.name}")
            save_state(source, dest, {"rows": None})
            return 0
    log(f"Source:   {source}")
    log(f"Template: {template}")
    log(f"As-of:    {as_of:%Y-%m-%d} -> {dest.name}")
    log(f"Output:   {dest}")

    stats = build_workbook(source, template, dest, skip_pivots=args.skip_pivots)
    save_state(source, dest, stats)
    log(f"Done. rows={stats['rows']} size={stats.get('output_size')} sample_month={stats.get('sample_month')!r}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Build Juanita Load Board xlsb from Oracle dump")
    p.add_argument("--source", help="Oracle Load Board .xlsx")
    p.add_argument("--template", help="Existing Everde Freight Data YTD .xlsb (formulas + pivots)")
    p.add_argument("--output", help="Output directory (default: Freight\\WeeklyDrop)")
    p.add_argument("--from-archive", action="store_true", help="Use newest dump in WeeklyDrop\\archive")
    p.add_argument("--force", action="store_true", help="Rebuild even if this dump was already processed")
    p.add_argument("--skip-pivots", action="store_true", help="Paste + formulas only (faster debug)")
    args = p.parse_args()
    try:
        return run(args)
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
