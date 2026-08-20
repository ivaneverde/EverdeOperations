#!/usr/bin/env python3
"""Replace stale HTML-bootstrapped crosswalk_rows with today's share Sales_Weather_Crosswalk JSON."""
from __future__ import annotations

import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "weather_dashboard_data.json"


def _wx_root() -> Path:
    env = os.environ.get("WEATHER_DATA_ROOT", "").strip()
    if env:
        return Path(env)
    return Path(r"\\192.168.190.10\Claude Sandbox\JS Files\Weather Data")


def _latest_crosswalk(shared: Path) -> Path | None:
    hits = list(shared.glob("Sales_Weather_Crosswalk_*.json"))
    hits = [p for p in hits if p.is_file() and not p.name.startswith("~$")]
    if not hits:
        return None
    return max(hits, key=lambda p: p.stat().st_mtime)


def main() -> int:
    if not OUT.is_file():
        print(f"Missing {OUT}", flush=True)
        return 1
    src = _latest_crosswalk(_wx_root() / "shared")
    if src is None:
        print("No Sales_Weather_Crosswalk_*.json on share; leaving portal JSON as-is.", flush=True)
        return 0

    cw = json.loads(src.read_text(encoding="utf-8"))
    rows = cw.get("rows") or []
    meta = cw.get("metadata") or {}
    doc = json.loads(OUT.read_text(encoding="utf-8"))
    doc["crosswalk_rows"] = rows
    doc["crosswalk_meta"] = meta
    weather = doc.setdefault("weather", {})
    if meta.get("in_progress_week") is not None:
        weather["iso_week"] = meta["in_progress_week"]
    if meta.get("iso_year") is not None:
        weather["iso_year"] = meta["iso_year"]
    if meta.get("build_date"):
        weather["today"] = meta["build_date"]
        weather["fetched_date"] = weather.get("fetched_date") or meta["build_date"]
    OUT.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(
        f"Merged {len(rows)} crosswalk rows from {src.name} "
        f"(weeks {meta.get('iso_weeks_included', ['?'])[0]}-"
        f"{meta.get('iso_weeks_included', ['?'])[-1]}) into {OUT.name}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
