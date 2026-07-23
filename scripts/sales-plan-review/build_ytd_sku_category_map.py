#!/usr/bin/env python3
"""
Build HD/Lowe's SKU → Plant Category maps from Inventory Cross References.

The YTD Following Week workbooks have no Subclass column. Plant Category on the
HD/Lowe's xref (same values as XXTT inventory CATEGORY, e.g. SHRUB EVERGREEN)
is the join used to answer shrub/landscape-style questions.

Outputs (under --out-dir):
  hd_sku_category_map.json
  lowes_sku_category_map.json
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from pyxlsb import open_workbook

DEFAULT_XREF_DIR = Path(
    r"\\192.168.190.10\Claude Sandbox\JS Files\Shared\Inventory Cross References"
)


def _sku_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return str(v).rstrip("0").rstrip(".")
    s = str(v).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        return s[:-2]
    return s


def load_xref_sku_category(xlsb_path: Path) -> dict[str, dict]:
    """Return {sku: {category, item, description}} (first non-empty category wins)."""
    rows: list[list] = []
    with open_workbook(str(xlsb_path)) as wb:
        with wb.get_sheet("DATA") as ws:
            for r in ws.rows():
                rows.append([c.v for c in r])
    if not rows:
        return {}
    hdr = [str(h or "").strip() for h in rows[0]]
    sku_i = hdr.index("SKU")
    cat_i = hdr.index("Plant Category")
    item_i = hdr.index("Item") if "Item" in hdr else -1
    desc_i = hdr.index("Item Description") if "Item Description" in hdr else -1

    out: dict[str, dict] = {}
    for r in rows[1:]:
        sku = _sku_str(r[sku_i] if sku_i < len(r) else None)
        cat = str((r[cat_i] if cat_i < len(r) else None) or "").strip()
        if not sku or not cat:
            continue
        if sku in out:
            continue
        entry = {"category": cat}
        if item_i >= 0:
            item = str((r[item_i] if item_i < len(r) else None) or "").strip()
            if item:
                entry["item"] = item
        if desc_i >= 0:
            desc = str((r[desc_i] if desc_i < len(r) else None) or "").strip()
            if desc:
                entry["description"] = desc
        out[sku] = entry
    return out


def find_xref(xref_dir: Path, patterns: list[str]) -> Path | None:
    if not xref_dir.is_dir():
        return None
    hits: list[Path] = []
    for pat in patterns:
        hits.extend(xref_dir.glob(pat))
    hits = [p for p in hits if p.is_file() and not p.name.startswith("~$")]
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def write_map(
    kind: str,
    source: Path,
    mapping: dict[str, dict],
    out_path: Path,
) -> None:
    cats = Counter(v["category"] for v in mapping.values())
    payload = {
        "kind": kind,
        "sourceFile": source.name,
        "sourcePath": str(source),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "skuCount": len(mapping),
        "categoryCounts": dict(cats.most_common()),
        "note": (
            "Plant Category from HD/Lowe's Inventory Cross Reference "
            "(same taxonomy as XXTT inventory CATEGORY). Use when YTD "
            "Following Week has no Subclass column."
        ),
        "bySku": mapping,
    }
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {out_path} ({len(mapping):,} SKUs, top={cats.most_common(3)})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xref-dir", default=str(DEFAULT_XREF_DIR))
    ap.add_argument("--out-dir", default="public")
    ap.add_argument("--hd-xref", default="")
    ap.add_argument("--lowes-xref", default="")
    args = ap.parse_args()

    xref_dir = Path(args.xref_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    hd = Path(args.hd_xref) if args.hd_xref else find_xref(
        xref_dir,
        [
            "Home Depot Corp-VN=PO xref*.xlsb",
            "Home_Depot_Corp-VN_PO_xref*.xlsb",
            "Home Depot*xref*.xlsb",
        ],
    )
    lowes = Path(args.lowes_xref) if args.lowes_xref else find_xref(
        xref_dir,
        ["LOWE'S xref*.xlsb", "LOWE_S_xref*.xlsb", "LOWE*xref*.xlsb"],
    )

    # pyxlsb can struggle with UNC — copy to temp when needed
    def local_copy(p: Path) -> Path:
        if str(p).startswith("\\\\"):
            tmp = Path(tempfile.gettempdir()) / p.name
            shutil.copy2(p, tmp)
            return tmp
        return p

    if hd and hd.is_file():
        write_map("hd", hd, load_xref_sku_category(local_copy(hd)), out_dir / "hd_sku_category_map.json")
    else:
        print(f"WARN: HD xref not found under {xref_dir}")

    if lowes and lowes.is_file():
        write_map(
            "lowes",
            lowes,
            load_xref_sku_category(local_copy(lowes)),
            out_dir / "lowes_sku_category_map.json",
        )
    else:
        print(f"WARN: Lowe's xref not found under {xref_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
