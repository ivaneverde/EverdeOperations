#!/usr/bin/env python3
"""
Extract HD Sales YTD with Following Week Sales workbook → compact JSON artifacts.

Input (default): newest HD Sales YTD*.xlsx under
  DataDrops\\Sales Plan Review\\WeeklyDrop

Outputs:
  - hd_ytd_meta.json   (columns, formats, freeze, totals, rowCount, asOf)
  - hd_ytd_rows.json.gz  (JSON array of row arrays)

Usage:
  python extract_hd_ytd_following.py
  python extract_hd_ytd_following.py --input "\\\\...\\file.xlsx" --out-dir public
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

DEFAULT_DROP = Path(
    r"\\192.168.190.10\Claude Sandbox\DataDrops\Sales Plan Review\WeeklyDrop"
)
# Excel freeze at H3 → first 7 columns sticky
FREEZE_COLUMNS = 7
CHUNK_WARN_MB = 40


def newest_hd_ytd(drop: Path) -> Path | None:
    if not drop.is_dir():
        return None
    hits = []
    for pat in (
        "HD Sales YTD with Following Week Sales*.xlsx",
        "HD Sales YTD*.xlsx",
    ):
        hits.extend(drop.glob(pat))
    hits = [p for p in hits if p.is_file() and not p.name.startswith("~$")]
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def as_of_from_name(name: str) -> str | None:
    # e.g. HD Sales YTD with Following Week Sales 07 20 26.xlsx
    m = re.search(r"(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})", name)
    if not m:
        return None
    mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yy < 100:
        yy += 2000
    try:
        return f"{yy:04d}-{mm:02d}-{dd:02d}"
    except ValueError:
        return None


def infer_format(col: str, series: pd.Series) -> str:
    name = (col or "").lower()
    if any(k in name for k in ("$", "retail", "sales $", "margin")):
        return "currency"
    if any(k in name for k in ("units", "on hands", "on hand", "qty", "order")):
        return "integer"
    if series.dtype.kind in "iufc":
        sample = series.dropna().head(20)
        if len(sample) and (sample.abs() > 100).any() and ("$" in name or "sales" in name):
            return "currency"
        if series.dtype.kind in "iu" or (
            len(sample) and (sample == sample.round()).all()
        ):
            return "integer"
        return "number"
    return "text"


def cell_value(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat()[:10]
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="", help="Explicit workbook path")
    ap.add_argument(
        "--weekly-drop",
        default=str(DEFAULT_DROP),
        help="WeeklyDrop folder when --input omitted",
    )
    ap.add_argument(
        "--out-dir",
        default="",
        help="Output directory (default: repo public/)",
    )
    args = ap.parse_args()

    repo = Path(__file__).resolve().parents[2]
    out_dir = Path(args.out_dir) if args.out_dir else repo / "public"
    out_dir.mkdir(parents=True, exist_ok=True)

    src = Path(args.input) if args.input.strip() else newest_hd_ytd(Path(args.weekly_drop))
    if not src or not src.is_file():
        print(f"No HD Sales YTD workbook found. Looked in: {args.weekly_drop}", file=sys.stderr)
        return 1

    print(f"Reading: {src}", flush=True)
    # Row 1 (0) = totals formulas; row 2 (1) = headers; row 3+ = data
    raw = pd.read_excel(src, sheet_name=0, header=None, engine="openpyxl")
    if raw.shape[0] < 3:
        print("Workbook has fewer than 3 rows", file=sys.stderr)
        return 1

    headers = [
        str(v).strip() if v is not None and not (isinstance(v, float) and pd.isna(v)) else f"Col{i+1}"
        for i, v in enumerate(raw.iloc[1].tolist())
    ]
    # Dedupe header names
    seen: dict[str, int] = {}
    columns: list[str] = []
    for h in headers:
        if h not in seen:
            seen[h] = 0
            columns.append(h)
        else:
            seen[h] += 1
            columns.append(f"{h}_{seen[h]}")

    body = raw.iloc[2:].copy()
    body.columns = range(len(columns))
    body = body.reset_index(drop=True)

    # Reconstruct KEY (col 0) when formula blanks after data_only-less read
    sku_i, store_i = 3, 5  # SKU Nbr, Store Nbr typical positions
    if len(columns) > store_i:
        for i in range(len(body)):
            key = body.iat[i, 0]
            if key is None or (isinstance(key, float) and pd.isna(key)) or (
                isinstance(key, str) and key.startswith("=")
            ):
                sku = body.iat[i, sku_i]
                store = body.iat[i, store_i]
                if sku is not None and store is not None and not (
                    isinstance(sku, float) and pd.isna(sku)
                ):
                    body.iat[i, 0] = f"{sku}-{store}"

    formats = []
    for ci, col in enumerate(columns):
        formats.append(infer_format(col, body[ci]))

    # Totals: prefer numeric from row 0; else sum body for currency/integer cols
    totals: list = []
    for ci, fmt in enumerate(formats):
        v = raw.iat[0, ci] if ci < raw.shape[1] else None
        if isinstance(v, (int, float)) and not pd.isna(v):
            totals.append(float(v) if isinstance(v, float) else int(v))
        elif fmt in ("currency", "integer", "number"):
            s = pd.to_numeric(body[ci], errors="coerce")
            totals.append(float(s.sum()) if fmt == "currency" else float(s.sum()))
        else:
            totals.append(None)
    if totals and totals[1] is None:
        totals[1] = "Grand Total"

    rows = []
    for i in range(len(body)):
        row = [cell_value(body.iat[i, ci]) for ci in range(len(columns))]
        # Drop fully empty trailing noise rows
        if all(x is None or x == "" for x in row):
            continue
        rows.append(row)

    as_of = as_of_from_name(src.name) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meta = {
        "sourceFile": src.name,
        "sourcePath": str(src),
        "sheet": "Data",
        "asOf": as_of,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "columns": columns,
        "formats": formats,
        "freezeColumns": FREEZE_COLUMNS,
        "totals": totals,
        "rowCount": len(rows),
        "columnCount": len(columns),
    }

    meta_path = out_dir / "hd_ytd_meta.json"
    rows_path = out_dir / "hd_ytd_rows.json.gz"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with gzip.open(rows_path, "wb", compresslevel=6) as f:
        f.write(payload)

    mb = rows_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {meta_path} ({meta['rowCount']:,} rows × {meta['columnCount']} cols)")
    print(f"Wrote {rows_path} ({mb:.1f} MB gzip)")
    if mb > CHUNK_WARN_MB:
        print(f"WARNING: gzip > {CHUNK_WARN_MB} MB; consider chunking later", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
