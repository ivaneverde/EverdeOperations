#!/usr/bin/env python3
"""
Extract embedded dashboard JSON from Everde_Freight_Dashboard*.html.

The static HTML ships a single JSON array in:
  <script id="dashboard-data" type="application/json">...</script>

Writes one .json file per tab (CELL or TABLE) plus manifest.json.
Optional: emit .csv for TABLE tabs (headers + rows).

Does not depend on the numbered _pipeline/scripts — only the published HTML.

Usage:
  python scripts/freight/extract_dashboard_html.py \\
    --html "//192.168.190.10/Claude Sandbox/DataDrops/Freight/Everde_Freight_Dashboard_2026-05-04.html" \\
    --out ./freight_extract_out

  python scripts/freight/extract_dashboard_html.py --html path/to/file.html --out ./out --csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any


MARKER_START = '<script id="dashboard-data" type="application/json">'
MARKER_END = "</script>"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_tabs_json(html: str) -> list[dict[str, Any]]:
    i = html.find(MARKER_START)
    if i == -1:
        raise ValueError(
            f"Could not find {MARKER_START!r}. "
            "Is this an Everde freight dashboard HTML export?"
        )
    i += len(MARKER_START)
    j = html.find(MARKER_END, i)
    if j == -1:
        raise ValueError("Could not find closing </script> for dashboard-data.")
    raw = html[i:j].strip()
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("dashboard-data JSON must be an array of tab objects.")
    return data


def tab_kind(tab: dict[str, Any]) -> str:
    return "TABLE" if isinstance(tab.get("table"), dict) else "CELL"


def safe_slug(name: str, index: int) -> str:
    base = name.strip() or f"tab_{index}"
    cleaned = re.sub(r'[<>:"/\\|?*]', "_", base)
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("._")
    return f"{index:02d}_{cleaned}"[:140]


def write_table_csv(path: Path, table: dict[str, Any]) -> None:
    headers = table.get("headers") or []
    rows = table.get("rows") or []
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if headers:
            w.writerow(headers)
        for row in rows:
            if isinstance(row, (list, tuple)):
                w.writerow(list(row))
            else:
                w.writerow([row])


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--html",
        required=True,
        type=Path,
        help="Path to Everde_Freight_Dashboard*.html (UNC //host/share/... ok on Windows).",
    )
    p.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output directory (created if missing).",
    )
    p.add_argument(
        "--csv",
        action="store_true",
        help="Also write .csv for tabs that include a `table` object.",
    )
    args = p.parse_args()

    html_path: Path = args.html
    out_dir: Path = args.out

    if not html_path.is_file():
        print(f"error: HTML file not found: {html_path}", file=sys.stderr)
        return 1

    html = read_text(html_path)
    try:
        tabs = extract_tabs_json(html)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []

    for idx, tab in enumerate(tabs, start=1):
        name = str(tab.get("name") or f"tab_{idx}")
        slug = safe_slug(name, idx)
        kind = tab_kind(tab)

        json_path = out_dir / f"{slug}.json"
        json_path.write_text(
            json.dumps(tab, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        entry: dict[str, Any] = {
            "index": idx,
            "name": name,
            "kind": kind,
            "json_file": json_path.name,
        }

        if kind == "TABLE":
            tbl = tab["table"]
            headers = tbl.get("headers") or []
            rows = tbl.get("rows") or []
            entry["table_rows"] = len(rows)
            entry["table_cols"] = len(headers)
            if args.csv:
                csv_path = out_dir / f"{slug}.csv"
                write_table_csv(csv_path, tbl)
                entry["csv_file"] = csv_path.name

        if kind == "CELL":
            cells = tab.get("cells") or []
            entry["cell_count"] = len(cells)
            entry["max_row"] = tab.get("max_row")
            entry["max_col"] = tab.get("max_col")

        manifest.append(entry)

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "source_html": str(html_path),
                "tab_count": len(tabs),
                "tabs": manifest,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(tabs)} tab JSON files + manifest.json under {out_dir.resolve()}")
    if args.csv:
        print("CSV files written for TABLE tabs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
