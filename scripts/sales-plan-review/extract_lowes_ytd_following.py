#!/usr/bin/env python3
"""
Extract Lowe's YTD BY STORE SKU workbook → compact JSON artifacts.

Input (default): newest YTD BY STORE SKU*.xlsb / Lowes YTD*.xlsb under
  DataDrops\\Sales Plan Review\\WeeklyDrop

Outputs:
  - lowes_ytd_meta.json
  - lowes_ytd_rows.json.gz

Layout (sheet NEW):
  Row 1 = date banner, Row 2 = headers, Row 3+ = data
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
# Sticky: Subregion, Store, Store Desc, Item, Item Desc
FREEZE_COLUMNS = 5
CHUNK_WARN_MB = 40


def newest_lowes_ytd(drop: Path) -> Path | None:
    if not drop.is_dir():
        return None
    hits = []
    for pat in (
        "YTD BY STORE SKU*.xlsb",
        "YTD BY STORE SKU*.xlsx",
        "Lowes YTD*.xlsb",
        "LOW YTD BY STORE SKU*.xlsb",
        "LOWES YTD*.xlsb",
    ):
        hits.extend(drop.glob(pat))
    hits = [p for p in hits if p.is_file() and not p.name.startswith("~$")]
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def as_of_from_name(name: str) -> str | None:
    # 7.20.26 or 07 20 26
    m = re.search(r"(\d{1,2})[.\s_-]+(\d{1,2})[.\s_-]+(\d{2,4})", name)
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
    name = (col or "").lower().replace("\n", " ")
    if any(k in name for k in ("$", "retail", "sales $", "margin")):
        return "currency"
    if any(
        k in name
        for k in ("units", "on hands", "on hand", "oh units", "shipped", "qty", "order")
    ):
        return "integer"
    if series.dtype.kind in "iufc":
        sample = series.dropna().head(20)
        if series.dtype.kind in "iu" or (
            len(sample) and (sample == sample.round()).all()
        ):
            return "integer"
        return "number"
    return "text"


def clean_header(v, i: int) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return f"Col{i+1}"
    s = str(v).replace("\n", " ").strip()
    return s or f"Col{i+1}"


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
    ap.add_argument("--input", default="")
    ap.add_argument("--weekly-drop", default=str(DEFAULT_DROP))
    ap.add_argument("--out-dir", default="")
    args = ap.parse_args()

    repo = Path(__file__).resolve().parents[2]
    out_dir = Path(args.out_dir) if args.out_dir else repo / "public"
    out_dir.mkdir(parents=True, exist_ok=True)

    src = (
        Path(args.input)
        if args.input.strip()
        else newest_lowes_ytd(Path(args.weekly_drop))
    )
    if not src or not src.is_file():
        print(
            f"No Lowe's YTD BY STORE SKU workbook found. Looked in: {args.weekly_drop}",
            file=sys.stderr,
        )
        return 1

    engine = "pyxlsb" if src.suffix.lower() == ".xlsb" else "openpyxl"
    print(f"Reading ({engine}): {src}", flush=True)
    raw = pd.read_excel(src, sheet_name=0, header=None, engine=engine)
    if raw.shape[0] < 3:
        print("Workbook has fewer than 3 rows", file=sys.stderr)
        return 1

    headers = [clean_header(v, i) for i, v in enumerate(raw.iloc[1].tolist())]
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
    del raw

    formats = [infer_format(col, body[ci]) for ci, col in enumerate(columns)]

    totals: list = [None] * len(columns)
    totals[0] = "Grand Total"
    for ci, fmt in enumerate(formats):
        if fmt in ("currency", "integer", "number"):
            s = pd.to_numeric(body[ci], errors="coerce")
            totals[ci] = float(s.sum())

    rows = []
    for i in range(len(body)):
        row = [cell_value(body.iat[i, ci]) for ci in range(len(columns))]
        if all(x is None or x == "" for x in row):
            continue
        rows.append(row)

    as_of = as_of_from_name(src.name) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meta = {
        "sourceFile": src.name,
        "sourcePath": str(src),
        "sheet": "NEW",
        "retailer": "Lowes",
        "asOf": as_of,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "columns": columns,
        "formats": formats,
        "freezeColumns": FREEZE_COLUMNS,
        "totals": totals,
        "rowCount": len(rows),
        "columnCount": len(columns),
    }

    meta_path = out_dir / "lowes_ytd_meta.json"
    rows_path = out_dir / "lowes_ytd_rows.json.gz"
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    with gzip.open(rows_path, "wb", compresslevel=6) as f:
        f.write(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    mb = rows_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {meta_path} ({meta['rowCount']:,} rows × {meta['columnCount']} cols)")
    print(f"Wrote {rows_path} ({mb:.1f} MB gzip)")
    if mb > CHUNK_WARN_MB:
        print(f"WARNING: gzip > {CHUNK_WARN_MB} MB; consider chunking later", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
