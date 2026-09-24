"""
Extract Jonathan's Ops & Sales Adjustments workbooks from reports/_extras
into nested dicts for wcro_data.json (Refresh 5.51+).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


def safe_read(value: Any) -> Any:
    if isinstance(value, str) and value.startswith("="):
        return None
    return value


def norm_header(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\n", " ")).strip()


def as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None


def as_int_round(value: Any) -> int | None:
    f = as_float(value)
    return None if f is None else int(round(f))


def find_header_row(rows: list[tuple], required_substr: str, max_scan: int = 40) -> int | None:
    needle = required_substr.lower()
    for i, row in enumerate(rows[:max_scan]):
        for cell in row:
            if isinstance(cell, str) and needle in norm_header(cell).lower():
                return i
    return None


def col_map(header_row: tuple) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        key = norm_header(cell)
        if key and key not in out:
            out[key] = i
    return out


def find_col(cmap: dict[str, int], *candidates: str) -> int | None:
    lower = {k.lower(): i for k, i in cmap.items()}
    for cand in candidates:
        c = cand.lower()
        if c in lower:
            return lower[c]
        for k, i in lower.items():
            if c in k:
                return i
    return None


def load_sheet_rows(path: Path, sheet: str | None = None) -> tuple[str, list[tuple]]:
    wb = load_workbook(path, data_only=True, read_only=True)
    try:
        name = None
        if sheet and sheet in wb.sheetnames:
            name = sheet
        elif sheet:
            lower = sheet.lower()
            for sn in wb.sheetnames:
                if sn.lower() == lower or lower in sn.lower():
                    name = sn
                    break
        if name is None:
            name = wb.sheetnames[0]
        ws = wb[name]
        rows = [tuple(safe_read(c) for c in row) for row in ws.iter_rows(values_only=True)]
        return name, rows
    finally:
        wb.close()


def _cell(row: tuple, idx: int | None) -> Any:
    if idx is None or idx >= len(row):
        return None
    return row[idx]


def _money(v: Any) -> float | None:
    f = as_float(v)
    return None if f is None else round(f, 2)


def _find_extras_file(extras: Path, *needles: str) -> Path | None:
    if not extras.is_dir():
        return None
    files = [
        p
        for p in extras.iterdir()
        if p.is_file() and p.suffix.lower() in {".xlsx", ".xlsm"} and not p.name.startswith("~$")
    ]
    for needle in needles:
        n = needle.lower()
        for p in files:
            if n in p.name.lower():
                return p
    return None


def _rows_as_dicts(rows: list[tuple], header_i: int, limit: int | None = None) -> list[dict[str, Any]]:
    if header_i is None or header_i >= len(rows):
        return []
    headers = [norm_header(h) for h in rows[header_i]]
    out: list[dict[str, Any]] = []
    for row in rows[header_i + 1 :]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        first = row[0]
        if isinstance(first, str) and first.strip().upper() in {"VISIBLE TOTAL", "TOTAL"}:
            continue
        if isinstance(first, str) and first.strip().startswith(("1.", "2.", "3.", "4.", "5.", "How ")):
            # Section title — stop if we're mid-table (caller handles sections)
            pass
        rec: dict[str, Any] = {}
        empty = True
        for i, h in enumerate(headers):
            if not h or i >= len(row):
                continue
            v = safe_read(row[i])
            if v is not None and str(v).strip() != "":
                empty = False
            rec[h] = v
        if empty:
            continue
        out.append(rec)
        if limit is not None and len(out) >= limit:
            break
    return out


def extract_ops_adjustments(path: Path) -> dict[str, Any]:
    out: dict[str, Any] = {
        "source_file": path.name,
        "citrus_inventory_changes": {"total_units": 0, "rows": []},
        "qc_release": {
            "totals_by_region": {},
            "all_regions_unlock_$": None,
            "top_50_unlock_$": None,
            "top_50": [],
            "by_region": {},
        },
        "ops_transfers": {},
    }

    # Citrus
    try:
        _, rows = load_sheet_rows(path, "Citrus Inventory Changes")
        hi = find_header_row(rows, "From Zone") or find_header_row(rows, "Farm")
        # Total units banner
        for row in rows[:6]:
            if row and isinstance(row[0], str) and "total units" in row[0].lower():
                out["citrus_inventory_changes"]["total_units"] = as_int_round(row[1]) or 0
        if hi is not None:
            cmap = col_map(rows[hi])
            citrus_rows = []
            for row in rows[hi + 1 :]:
                farm = _cell(row, find_col(cmap, "Farm"))
                if not farm:
                    continue
                citrus_rows.append(
                    {
                        "farm": str(farm),
                        "item": str(_cell(row, find_col(cmap, "Item")) or ""),
                        "item_name": str(_cell(row, find_col(cmap, "Item Name")) or ""),
                        "from_zone": str(_cell(row, find_col(cmap, "From Zone")) or ""),
                        "to_zone": str(_cell(row, find_col(cmap, "To Zone")) or ""),
                        "units": as_int_round(_cell(row, find_col(cmap, "Units"))) or 0,
                    }
                )
            out["citrus_inventory_changes"]["rows"] = citrus_rows
            if not out["citrus_inventory_changes"]["total_units"]:
                out["citrus_inventory_changes"]["total_units"] = sum(r["units"] for r in citrus_rows)
    except Exception as exc:
        out["citrus_inventory_changes"]["error"] = str(exc)

    # Top 50 banner + rows
    try:
        _, rows = load_sheet_rows(path, "Top 50")
        for row in rows[:5]:
            joined = " ".join(str(c) for c in row if c is not None)
            if "Unlock $ in the Top 50" in joined or (row and str(row[0]).startswith("Unlock $")):
                # values often in later cells
                for c in row:
                    f = as_float(c)
                    if f and f > 1000:
                        out["qc_release"]["top_50_unlock_$"] = round(f, 2)
                        break
            if "All regions, all items" in joined:
                for c in row:
                    f = as_float(c)
                    if f and f > 100_000:
                        out["qc_release"]["all_regions_unlock_$"] = round(f, 2)
                        break
        hi = find_header_row(rows, "Unlock $")
        if hi is not None:
            cmap = col_map(rows[hi])
            top: list[dict[str, Any]] = []
            for row in rows[hi + 1 :]:
                item = _cell(row, find_col(cmap, "Item"))
                if not item:
                    continue
                top.append(
                    {
                        "rank": as_int_round(_cell(row, find_col(cmap, "#"))),
                        "region": str(_cell(row, find_col(cmap, "Region")) or ""),
                        "item": str(item),
                        "description": str(_cell(row, find_col(cmap, "Description")) or ""),
                        "genus": str(_cell(row, find_col(cmap, "Genus")) or ""),
                        "size": str(_cell(row, find_col(cmap, "Size")) or ""),
                        "pool": str(_cell(row, find_col(cmap, "Item group (pool)", "Item group")) or ""),
                        "unlock_u": _money(_cell(row, find_col(cmap, "Unlock (u)"))),
                        "unlock_$": _money(_cell(row, find_col(cmap, "Unlock $"))),
                        "locked_u": as_int_round(_cell(row, find_col(cmap, "Locked (u)"))),
                        "uncovered_u": _money(_cell(row, find_col(cmap, "Uncovered store demand (u)"))),
                        "uncovered_$": _money(_cell(row, find_col(cmap, "Uncovered $"))),
                        "earliest_ready_days": as_int_round(
                            _cell(row, find_col(cmap, "Earliest ready (days)"))
                        ),
                        "why_locked": str(_cell(row, find_col(cmap, "Why locked")) or ""),
                        "release_needs": str(
                            _cell(
                                row,
                                find_col(
                                    cmap,
                                    "Release needs - farm · units · grade (zone / pad)",
                                    "Release needs",
                                ),
                            )
                            or ""
                        ),
                    }
                )
            out["qc_release"]["top_50"] = top
    except Exception as exc:
        out["qc_release"]["top_50_error"] = str(exc)

    # QC Release by region
    for region, sheet in (("S.CA", "QC Release S.CA"), ("N.CA", "QC Release N.CA"), ("FOR", "QC Release FOR")):
        try:
            _, rows = load_sheet_rows(path, sheet)
            totals: dict[str, Any] = {"region": region}
            for row in rows[:5]:
                if not row:
                    continue
                label = str(row[0] or "")
                if "Items with store demand" in label:
                    totals["item_count"] = as_int_round(row[4] if len(row) > 4 else None)
                    # Unlock $ often at index 6
                    for i, c in enumerate(row):
                        if isinstance(c, str) and "Unlock $" in c and i + 1 < len(row):
                            totals["unlock_$"] = _money(row[i + 1])
                    if "unlock_$" not in totals:
                        totals["unlock_$"] = _money(row[6] if len(row) > 6 else None)
                    for i, c in enumerate(row):
                        if isinstance(c, str) and "Locked units" in c and i + 2 < len(row):
                            totals["locked_u"] = as_int_round(row[i + 2])
            hi = find_header_row(rows, "Unlock $")
            items: list[dict[str, Any]] = []
            if hi is not None:
                cmap = col_map(rows[hi])
                for row in rows[hi + 1 :]:
                    item = _cell(row, find_col(cmap, "Item"))
                    if not item:
                        continue
                    items.append(
                        {
                            "item": str(item),
                            "description": str(_cell(row, find_col(cmap, "Description")) or ""),
                            "genus": str(_cell(row, find_col(cmap, "Genus")) or ""),
                            "size": str(_cell(row, find_col(cmap, "Size")) or ""),
                            "pool": str(_cell(row, find_col(cmap, "Item group (pool)")) or ""),
                            "unlock_u": _money(_cell(row, find_col(cmap, "Unlock (u)"))),
                            "unlock_$": _money(_cell(row, find_col(cmap, "Unlock $"))),
                            "locked_u": as_int_round(_cell(row, find_col(cmap, "Locked (u)"))),
                            "earliest_ready_days": as_int_round(
                                _cell(row, find_col(cmap, "Earliest ready (days)"))
                            ),
                            "why_locked": str(_cell(row, find_col(cmap, "Why locked")) or ""),
                            "release_needs": str(
                                _cell(
                                    row,
                                    find_col(
                                        cmap,
                                        "Release needs - farm · units · grade (zone / pad)",
                                        "Release needs",
                                    ),
                                )
                                or ""
                            ),
                        }
                    )
            out["qc_release"]["totals_by_region"][region] = totals
            out["qc_release"]["by_region"][region] = {
                "item_count": len(items),
                "top_items": items[:40],
            }
        except Exception as exc:
            out["qc_release"]["by_region"][region] = {"error": str(exc)}

    # Ops transfers into regions
    for dest, sheet in (("S.CA", "Transfers → S.CA"), ("N.CA", "Transfers → N.CA")):
        try:
            _, rows = load_sheet_rows(path, sheet)
            lane_totals: list[dict[str, Any]] = []
            total_u = None
            total_dollars = None
            # Lane summary starts at header "Lane" near row 4
            for i, row in enumerate(rows[:12]):
                if not row:
                    continue
                if norm_header(row[0]) == "Lane" and i < 10:
                    # summary table
                    for r in rows[i + 1 :]:
                        lane = r[0]
                        if lane is None:
                            continue
                        ls = str(lane).strip()
                        if ls.upper() == "TOTAL":
                            total_u = as_int_round(r[2] if len(r) > 2 else None)
                            total_dollars = _money(r[3] if len(r) > 3 else None)
                            break
                        if ls.upper() == "VISIBLE TOTAL" or "→" not in ls and "->" not in ls:
                            if "VISIBLE" in ls.upper():
                                break
                            continue
                        lane_totals.append(
                            {
                                "lane": ls,
                                "customer": str(r[1] or ""),
                                "transfer_u": as_int_round(r[2] if len(r) > 2 else None),
                                "transfer_$": _money(r[3] if len(r) > 3 else None),
                                "groups": as_int_round(r[4] if len(r) > 4 else None),
                            }
                        )
                    break
            # Detail header
            hi = None
            for i, row in enumerate(rows):
                if row and norm_header(row[0]) == "Lane" and any(
                    "Items in group" in norm_header(c) for c in row if c
                ):
                    hi = i
                    break
            groups: list[dict[str, Any]] = []
            if hi is not None:
                cmap = col_map(rows[hi])
                for row in rows[hi + 1 :]:
                    lane = _cell(row, find_col(cmap, "Lane"))
                    if not lane:
                        continue
                    groups.append(
                        {
                            "lane": str(lane),
                            "customer": str(_cell(row, find_col(cmap, "Customer")) or ""),
                            "description": str(_cell(row, find_col(cmap, "Description")) or ""),
                            "genus": str(_cell(row, find_col(cmap, "Genus")) or ""),
                            "size": str(_cell(row, find_col(cmap, "Size")) or ""),
                            "transfer_u": _money(_cell(row, find_col(cmap, "Transfer (u)"))),
                            "transfer_$": _money(_cell(row, find_col(cmap, "Transfer $"))),
                            "stores": as_int_round(_cell(row, find_col(cmap, "Stores"))),
                            "from_farms": str(
                                _cell(row, find_col(cmap, "From farm(s)", "From farm")) or ""
                            ),
                        }
                    )
            groups.sort(key=lambda g: g.get("transfer_$") or 0, reverse=True)
            out["ops_transfers"][f"into_{dest}"] = {
                "total_transfer_u": total_u,
                "total_transfer_$": total_dollars,
                "lane_totals": lane_totals,
                "top_groups": groups[:30],
                "group_count": len(groups),
            }
        except Exception as exc:
            out["ops_transfers"][f"into_{dest}"] = {"error": str(exc)}

    return out


_AM_SECTION_PATTERNS = [
    (re.compile(r"^1\.\s*Obvious wrong plants", re.I), "wrong_plants"),
    (re.compile(r"^2\.\s*Not set up", re.I), "not_set_up"),
    (re.compile(r"^3\.\s*Set up in another market", re.I), "other_market_only"),
    (re.compile(r"^4\.\s*Set up,? but no usable", re.I), "no_usable_item"),
    (re.compile(r"^4\.\s*Set up, no usable", re.I), "no_usable_item"),
    (re.compile(r"^5\.\s*Egregious", re.I), "egregious_on_hand"),
]


def _map_am_row(section: str, cmap: dict[str, int], row: tuple) -> dict[str, Any] | None:
    cust = _cell(row, find_col(cmap, "Cust", "Customer"))
    sku = _cell(row, find_col(cmap, "SKU"))
    if not cust and not sku:
        return None
    base = {
        "cust": str(cust or ""),
        "market": str(_cell(row, find_col(cmap, "Market")) or ""),
        "sku": str(sku or ""),
        "sku_name": str(
            _cell(row, find_col(cmap, "Customer SKU name", "SKU name", "LOW_Item_Desc")) or ""
        ),
    }
    if section == "wrong_plants":
        base.update(
            {
                "sku_plant": str(_cell(row, find_col(cmap, "SKU's plant", "SKU plant")) or ""),
                "item_paired": str(_cell(row, find_col(cmap, "Item paired")) or ""),
                "item_description": str(_cell(row, find_col(cmap, "Item description")) or ""),
                "item_plant": str(_cell(row, find_col(cmap, "Item's plant", "Item plant")) or ""),
                "stores_with_demand": as_int_round(
                    _cell(row, find_col(cmap, "Stores with demand"))
                ),
                "demand_$": _money(
                    _cell(
                        row,
                        find_col(
                            cmap,
                            "SKU demand $ in this market (once per SKU)",
                            "SKU demand $",
                            "demand $",
                        ),
                    )
                ),
            }
        )
    elif section == "not_set_up":
        base.update(
            {
                "unfilled_u": _money(_cell(row, find_col(cmap, "Unfilled units"))),
                "unfilled_$": _money(_cell(row, find_col(cmap, "Unfilled $"))),
                "set_up_in_other_markets": str(
                    _cell(row, find_col(cmap, "Set up in other markets")) or ""
                ),
            }
        )
    elif section == "other_market_only":
        base.update(
            {
                "short_$": _money(_cell(row, find_col(cmap, "Short $"))),
                "our_ab": str(_cell(row, find_col(cmap, "Our A+B", "A+B")) or ""),
            }
        )
    elif section == "egregious_on_hand":
        base.update(
            {
                "store": str(_cell(row, find_col(cmap, "Store", "Store #")) or ""),
                "on_hand_u": as_int_round(_cell(row, find_col(cmap, "On hand", "On-hand", "OH"))),
                "note": str(_cell(row, find_col(cmap, "Note", "Comment")) or ""),
            }
        )
    return base


def extract_am_setup_list(path: Path) -> dict[str, Any]:
    out: dict[str, Any] = {
        "source_file": path.name,
        "summary": [],
        "by_manager": {},
    }
    try:
        _, rows = load_sheet_rows(path, "Summary")
        hi = find_header_row(rows, "Account manager")
        if hi is not None:
            cmap = col_map(rows[hi])
            for row in rows[hi + 1 :]:
                am = _cell(row, find_col(cmap, "Account manager"))
                if not am or not isinstance(am, str):
                    continue
                if am.strip().lower().startswith("how to"):
                    break
                out["summary"].append(
                    {
                        "account_manager": am.strip(),
                        "wrong_plants_rows": as_int_round(
                            _cell(row, find_col(cmap, "Wrong plants (rows)"))
                        ),
                        "wrong_plants_demand_$": _money(
                            _cell(row, find_col(cmap, "Wrong plants - demand $"))
                        ),
                        "not_set_up_sku_x_market": as_int_round(
                            _cell(row, find_col(cmap, "Not set up (SKU x market)"))
                        ),
                        "unfilled_$": _money(_cell(row, find_col(cmap, "Unfilled $"))),
                        "other_market_only": as_int_round(
                            _cell(
                                row,
                                find_col(
                                    cmap,
                                    "Set up in another market only (SKU x market)",
                                    "Set up in another market only",
                                ),
                            )
                        ),
                        "short_$": _money(_cell(row, find_col(cmap, "Short $"))),
                        "no_usable_item": as_int_round(
                            _cell(row, find_col(cmap, "Set up, no usable item"))
                        ),
                        "no_usable_demand_$": _money(_cell(row, find_col(cmap, "Demand $"))),
                        "egregious_on_hand": as_int_round(
                            _cell(row, find_col(cmap, "Egregious on-hand"))
                        ),
                    }
                )
    except Exception as exc:
        out["summary_error"] = str(exc)

    wb = load_workbook(path, data_only=True, read_only=True)
    try:
        for sn in wb.sheetnames:
            if sn.strip().lower() == "summary":
                continue
            ws = wb[sn]
            rows = [tuple(safe_read(c) for c in row) for row in ws.iter_rows(values_only=True)]
            sections: dict[str, list[dict[str, Any]]] = {
                "wrong_plants": [],
                "not_set_up": [],
                "other_market_only": [],
                "no_usable_item": [],
                "egregious_on_hand": [],
            }
            current: str | None = None
            cmap: dict[str, int] = {}
            for row in rows:
                if not row or row[0] is None:
                    continue
                first = str(row[0]).strip()
                matched = False
                for pat, key in _AM_SECTION_PATTERNS:
                    if pat.match(first):
                        current = key
                        cmap = {}
                        matched = True
                        break
                if matched:
                    continue
                if current and not cmap:
                    # next non-empty row with "Cust" or "SKU" is header
                    joined = " ".join(norm_header(c) for c in row if c)
                    if "Cust" in joined or "SKU" in joined or "Store" in joined:
                        cmap = col_map(row)
                    continue
                if current and cmap:
                    if first.startswith(("1.", "2.", "3.", "4.", "5.", "How ")):
                        continue
                    rec = _map_am_row(current, cmap, row)
                    if rec:
                        sections[current].append(rec)
            # keep top by demand within each section
            for key, rows_list in sections.items():
                if key in {"wrong_plants"}:
                    rows_list.sort(key=lambda r: r.get("demand_$") or 0, reverse=True)
                elif key == "not_set_up":
                    rows_list.sort(key=lambda r: r.get("unfilled_$") or 0, reverse=True)
                elif key == "other_market_only":
                    rows_list.sort(key=lambda r: r.get("short_$") or 0, reverse=True)
                sections[key] = rows_list[:80]
            out["by_manager"][sn.strip()] = sections
    finally:
        wb.close()
    return out


def extract_xref_exceptions(path: Path) -> dict[str, Any]:
    out: dict[str, Any] = {
        "source_file": path.name,
        "counts": {},
        "hd_suspect_rows": [],
        "low_suspect_rows": [],
        "note": "Suspect rows are not shipped until corrected. Sorted by demand.",
    }

    def _load_suspect(sheet: str, channel: str) -> list[dict[str, Any]]:
        _, rows = load_sheet_rows(path, sheet)
        # counts from VISIBLE TOTAL row
        if rows and rows[0] and str(rows[0][0]).upper().startswith("VISIBLE"):
            # count often in a later cell
            for c in rows[0]:
                f = as_float(c)
                if f and f > 10:
                    out["counts"][f"{channel.lower()}_suspect_rows"] = int(f)
                    break
        hi = find_header_row(rows, "Expected_Genus") or find_header_row(rows, "SKU")
        if hi is None:
            return []
        cmap = col_map(rows[hi])
        rows_out: list[dict[str, Any]] = []
        for row in rows[hi + 1 :]:
            sku = _cell(row, find_col(cmap, "SKU"))
            if not sku:
                continue
            rows_out.append(
                {
                    "sku": str(sku),
                    "sku_name": str(
                        _cell(row, find_col(cmap, "HD_SKU_Name", "LOW_Item_Desc", "SKU_Name"))
                        or ""
                    ),
                    "expected_genus": str(_cell(row, find_col(cmap, "Expected_Genus")) or ""),
                    "expected_basis": str(_cell(row, find_col(cmap, "Expected_Basis")) or ""),
                    "row_genus": str(_cell(row, find_col(cmap, "Row_Genus")) or ""),
                    "item": str(_cell(row, find_col(cmap, "Item")) or ""),
                    "item_description": str(_cell(row, find_col(cmap, "Item_Description")) or ""),
                    "markets": str(_cell(row, find_col(cmap, "Markets")) or ""),
                    "account_manager": str(_cell(row, find_col(cmap, "Account_Manager")) or ""),
                    "demand_u": as_int_round(_cell(row, find_col(cmap, "Demand_u"))),
                    "demand_usd": _money(_cell(row, find_col(cmap, "Demand_usd"))),
                    "genera_on_sku": str(_cell(row, find_col(cmap, "Genera_on_SKU")) or ""),
                }
            )
        rows_out.sort(key=lambda r: r.get("demand_usd") or 0, reverse=True)
        return rows_out

    try:
        out["hd_suspect_rows"] = _load_suspect("HD suspect rows", "HD")
        out["counts"]["hd_suspect_rows"] = out["counts"].get(
            "hd_suspect_rows", len(out["hd_suspect_rows"])
        )
        # unique SKUs
        out["counts"]["hd_suspect_skus"] = len({r["sku"] for r in out["hd_suspect_rows"]})
    except Exception as exc:
        out["hd_error"] = str(exc)
    try:
        out["low_suspect_rows"] = _load_suspect("LOW suspect rows", "LOW")
        out["counts"]["low_suspect_rows"] = out["counts"].get(
            "low_suspect_rows", len(out["low_suspect_rows"])
        )
        out["counts"]["low_suspect_skus"] = len({r["sku"] for r in out["low_suspect_rows"]})
    except Exception as exc:
        out["low_error"] = str(exc)

    # Trim full lists in JSON — keep top 100 each (compact further in bot)
    out["hd_suspect_rows"] = out["hd_suspect_rows"][:100]
    out["low_suspect_rows"] = out["low_suspect_rows"][:100]
    return out


def extract_all_extras(reports: Path) -> dict[str, Any]:
    extras_dir = reports / "_extras"
    result: dict[str, Any] = {
        "ops_adjustments": None,
        "am_setup_list": None,
        "xref_exceptions": None,
        "extras_dir": str(extras_dir) if extras_dir.is_dir() else None,
    }
    if not extras_dir.is_dir():
        result["note"] = "No reports/_extras folder in this handoff."
        return result

    ops = _find_extras_file(extras_dir, "Operations Adjustments", "Citrus Inventory")
    am = _find_extras_file(extras_dir, "Account Manager Market Setup", "Market Setup List")
    xref = _find_extras_file(extras_dir, "Xref Exceptions")

    if ops:
        result["ops_adjustments"] = extract_ops_adjustments(ops)
    if am:
        result["am_setup_list"] = extract_am_setup_list(am)
    if xref:
        result["xref_exceptions"] = extract_xref_exceptions(xref)

    present = [k for k in ("ops_adjustments", "am_setup_list", "xref_exceptions") if result.get(k)]
    result["present"] = present
    return result
