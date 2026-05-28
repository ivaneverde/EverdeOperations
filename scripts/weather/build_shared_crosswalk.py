"""
build_shared_crosswalk.py
─────────────────────────
Everde Growers — Shared Sales/Weather Crosswalk Builder

Reads the latest weather sales report workbook and the latest retail
opportunity JSON, merges them into a unified crosswalk JSON that both
the Weather Dashboard and the West Coast Retail Dashboard can consume.

Output: Sales_Weather_Crosswalk_latest.json
        Written to the JS Files share for portal pickup.

Schedule: Runs as step 4 of Everde-Weather-DailyCheck (daily 9:30 AM CT)
          After build_sales_report_v2.py completes.

Usage:
    python build_shared_crosswalk.py
    python build_shared_crosswalk.py --weather-dir "path/to/weather/output"
                                     --retail-json  "path/to/retail_opp_data.json"
                                     --out          "path/to/output/dir"
"""

import json
import argparse
import sys
import os
import re
from pathlib import Path
from datetime import datetime, date

# ─────────────────────────────────────────────────────
# CONFIG — adjust paths to match your environment
# ─────────────────────────────────────────────────────

# Base share path — update if running locally vs. from network share
SHARE_BASE = Path(r"\\192.168.190.10\Claude Sandbox\JS Files")

# Where the weather pipeline writes its output workbook/JSON
WEATHER_DIR = SHARE_BASE / "Weather Data" / "output"

# Where extract_retail_opp.py writes retail_opp_data.json
RETAIL_JSON = SHARE_BASE / "West Coast Retail Opportunity" / "retail_opp_data.json"

# Where to write the crosswalk (read by both dashboards)
OUTPUT_DIR  = SHARE_BASE / "shared"


# ─────────────────────────────────────────────────────
# STATE → REGION MAPPING
# Aligns weather states with retail sales regions
# ─────────────────────────────────────────────────────

STATE_TO_REGION = {
    # West Coast
    "CA": "West Coast",
    "OR": "West Coast",
    "WA": "West Coast",
    "NV": "West Coast",
    "AZ": "West Coast",
    # NorCal sub-region (used in Sales Plan)
    "CA-NORCAL": "NorCal",
    "CA-SOCAL":  "SoCal",
    # Texas
    "TX": "Texas",
    "OK": "Texas",
    # Florida / Southeast
    "FL": "Florida",
    "GA": "Florida",
    "SC": "Florida",
    "NC": "Florida",
    # Mountain / Colorado
    "CO": "Mountain",
    "UT": "Mountain",
    "NM": "Mountain",
    "ID": "Mountain",
}

# GDD (Growing Degree Day) base temp for nursery stock (Fahrenheit)
GDD_BASE_F = 50


# ─────────────────────────────────────────────────────
# ARGUMENT PARSING
# ─────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Everde Shared Crosswalk Builder")
    p.add_argument("--weather-dir", default=str(WEATHER_DIR),
                   help="Directory containing weather output files")
    p.add_argument("--retail-json", default=str(RETAIL_JSON),
                   help="Path to retail_opp_data.json")
    p.add_argument("--out", default=str(OUTPUT_DIR),
                   help="Output directory for crosswalk JSON")
    p.add_argument("--debug", action="store_true", help="Print debug info")
    return p.parse_args()


# ─────────────────────────────────────────────────────
# FILE DISCOVERY HELPERS
# ─────────────────────────────────────────────────────

def find_latest_file(directory: Path, patterns: list[str]) -> Path | None:
    """Find the most recently modified file matching any of the glob patterns."""
    candidates = []
    for pat in patterns:
        candidates.extend(directory.glob(pat))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def load_json_safe(path: Path) -> dict | None:
    """Load a JSON file, return None on any error."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  WARNING: Could not load {path}: {e}")
        return None


# ─────────────────────────────────────────────────────
# WEATHER DATA LOADER
# ─────────────────────────────────────────────────────

def load_weather_data(weather_dir: Path, debug: bool = False) -> dict:
    """
    Load the latest weather output JSON.
    Falls back to scanning for weather_data_*.json or weather_report_*.json.
    Returns a normalized dict keyed by state abbreviation.
    """
    weather_dir = Path(weather_dir)
    
    if debug:
        print(f"\n[Weather] Scanning: {weather_dir}")

    # Try standard output filenames first
    candidates = [
        weather_dir / "weather_sales_data.json",
        weather_dir / "weather_data_latest.json",
    ]
    
    weather_json = None
    for c in candidates:
        if c.exists():
            weather_json = c
            break
    
    if weather_json is None:
        weather_json = find_latest_file(weather_dir, [
            "weather_data_*.json",
            "weather_report_*.json",
            "sales_state_*.json",
        ])
    
    if weather_json is None:
        print(f"  WARNING: No weather JSON found in {weather_dir}")
        return {}
    
    if debug:
        print(f"  → Using: {weather_json.name}")
    
    raw = load_json_safe(weather_json)
    if not raw:
        return {}
    
    # Normalize — handle both flat and nested formats
    states = {}
    
    # Format A: {"states": {"CA": {...}, "OR": {...}}}
    if "states" in raw:
        states = raw["states"]
    # Format B: {"CA": {...}, "OR": {...}}
    elif any(len(k) == 2 and k.isupper() for k in raw.keys()):
        states = raw
    # Format C: [{"state": "CA", ...}, ...]
    elif isinstance(raw, list):
        for item in raw:
            if "state" in item:
                states[item["state"]] = item
    
    return states


# ─────────────────────────────────────────────────────
# RETAIL DATA LOADER
# ─────────────────────────────────────────────────────

def load_retail_data(retail_json_path: Path, debug: bool = False) -> dict:
    """
    Load retail_opp_data.json and extract region-level summaries.
    Returns dict keyed by region name.
    """
    retail_json_path = Path(retail_json_path)
    
    if debug:
        print(f"\n[Retail] Loading: {retail_json_path}")
    
    if not retail_json_path.exists():
        print(f"  WARNING: retail_opp_data.json not found at {retail_json_path}")
        return {}
    
    raw = load_json_safe(retail_json_path)
    if not raw:
        return {}
    
    regions = {}
    
    # Extract regional summary from retail data
    # retail_opp_data.json structure: {"summary": {...}, "regions": {...}, ...}
    if "regions" in raw:
        regions = raw["regions"]
    elif "summary" in raw and "by_region" in raw.get("summary", {}):
        regions = raw["summary"]["by_region"]
    
    if debug:
        print(f"  → Found {len(regions)} regions")
    
    return {"raw": raw, "regions": regions}


# ─────────────────────────────────────────────────────
# CROSSWALK BUILDER
# ─────────────────────────────────────────────────────

def build_crosswalk(weather_states: dict, retail_data: dict, debug: bool = False) -> dict:
    """
    Merge weather + retail data into the shared crosswalk structure.
    
    Output structure:
    {
      "generated_at": "ISO timestamp",
      "week": "Wk21 2026",
      "states": {
        "CA": {
          "state": "CA",
          "region": "West Coast",
          "weather": { ...weather metrics... },
          "retail": { ...retail metrics... },
          "gdd_index": float,
          "planting_outlook": "favorable|marginal|unfavorable",
          "sell_through_risk": "low|medium|high"
        }
      },
      "regions": {
        "West Coast": {
          "states": ["CA", "OR", "WA", "NV", "AZ"],
          "avg_temp_f": float,
          "avg_precip_in": float,
          "gdd_avg": float,
          "retail_units_sold": int,
          "retail_revenue": float,
          "weather_risk_score": float
        }
      },
      "summary": {
        "best_planting_states": [...],
        "weather_risk_states": [...],
        "total_states": int,
        "week_label": "Wk21 2026"
      }
    }
    """
    now = datetime.now()
    week_num = now.isocalendar()[1]
    year = now.year
    week_label = f"Wk{week_num} {year}"
    
    crosswalk = {
        "generated_at": now.isoformat(),
        "week": week_label,
        "states": {},
        "regions": {},
        "summary": {}
    }
    
    retail_regions = retail_data.get("regions", {}) if retail_data else {}
    retail_raw     = retail_data.get("raw", {}) if retail_data else {}
    
    # ── Build per-state entries ──────────────────────
    for state_code, wx in weather_states.items():
        region = STATE_TO_REGION.get(state_code, "Other")
        
        # Weather metrics (handle varied field names from build_sales_state_v2.py)
        avg_temp   = _coerce_float(wx.get("avg_temp_f") or wx.get("avg_temp") or wx.get("temperature"))
        avg_precip = _coerce_float(wx.get("precip_in")  or wx.get("precipitation") or wx.get("precip"))
        avg_high   = _coerce_float(wx.get("avg_high_f") or wx.get("high_temp") or wx.get("avg_high"))
        avg_low    = _coerce_float(wx.get("avg_low_f")  or wx.get("low_temp") or wx.get("avg_low"))
        
        # GDD calculation: ((high + low) / 2) - base, floored at 0
        gdd = 0.0
        if avg_high is not None and avg_low is not None:
            gdd = max(0.0, ((avg_high + avg_low) / 2.0) - GDD_BASE_F)
        elif avg_temp is not None:
            gdd = max(0.0, avg_temp - GDD_BASE_F)
        
        # Planting outlook based on GDD and precip
        planting_outlook = _classify_planting(gdd, avg_precip)
        
        # Sell-through risk based on weather
        sell_through_risk = _classify_sell_through_risk(avg_temp, avg_precip)
        
        # Retail metrics for this state (if available in retail data)
        retail_state = {}
        if retail_raw:
            # Try to find state-level data in retail JSON
            for key in ["by_state", "states", "state_data"]:
                if key in retail_raw and state_code in retail_raw[key]:
                    retail_state = retail_raw[key][state_code]
                    break
        
        crosswalk["states"][state_code] = {
            "state":    state_code,
            "region":   region,
            "weather": {
                "avg_temp_f":   avg_temp,
                "avg_high_f":   avg_high,
                "avg_low_f":    avg_low,
                "precip_in":    avg_precip,
                "conditions":   wx.get("conditions") or wx.get("description") or "N/A",
                "alert":        wx.get("alert") or wx.get("weather_alert") or None,
            },
            "retail": retail_state or None,
            "gdd_index":          round(gdd, 2),
            "planting_outlook":   planting_outlook,
            "sell_through_risk":  sell_through_risk,
        }
    
    # ── Build region-level rollups ───────────────────
    region_buckets: dict[str, list] = {}
    for state_code, entry in crosswalk["states"].items():
        r = entry["region"]
        region_buckets.setdefault(r, []).append(entry)
    
    for region_name, entries in region_buckets.items():
        temps   = [e["weather"]["avg_temp_f"]  for e in entries if e["weather"]["avg_temp_f"]  is not None]
        precips = [e["weather"]["precip_in"]   for e in entries if e["weather"]["precip_in"]   is not None]
        gdds    = [e["gdd_index"] for e in entries]
        
        # Retail rollup for the region
        retail_region_data = retail_regions.get(region_name, {})
        
        crosswalk["regions"][region_name] = {
            "states":              [e["state"] for e in entries],
            "avg_temp_f":          round(sum(temps)   / len(temps),   1) if temps   else None,
            "avg_precip_in":       round(sum(precips) / len(precips), 2) if precips else None,
            "gdd_avg":             round(sum(gdds)    / len(gdds),    2) if gdds    else 0.0,
            "retail_units_sold":   retail_region_data.get("units_sold")  or retail_region_data.get("units"),
            "retail_revenue":      retail_region_data.get("revenue")     or retail_region_data.get("net_sales"),
            "weather_risk_score":  _region_risk_score(entries),
            "favorable_states":    [e["state"] for e in entries if e["planting_outlook"] == "favorable"],
            "risk_states":         [e["state"] for e in entries if e["sell_through_risk"] == "high"],
        }
    
    # ── Summary ─────────────────────────────────────
    all_states = list(crosswalk["states"].values())
    best = sorted(
        [s for s in all_states if s["planting_outlook"] == "favorable"],
        key=lambda x: x["gdd_index"], reverse=True
    )
    risky = [s for s in all_states if s["sell_through_risk"] == "high"]
    
    crosswalk["summary"] = {
        "week_label":              week_label,
        "total_states":            len(all_states),
        "favorable_planting":      len([s for s in all_states if s["planting_outlook"] == "favorable"]),
        "marginal_planting":       len([s for s in all_states if s["planting_outlook"] == "marginal"]),
        "unfavorable_planting":    len([s for s in all_states if s["planting_outlook"] == "unfavorable"]),
        "high_risk_states":        len(risky),
        "best_planting_states":    [s["state"] for s in best[:5]],
        "weather_risk_states":     [s["state"] for s in risky],
    }
    
    if debug:
        print(f"\n[Crosswalk] Built {len(crosswalk['states'])} states, "
              f"{len(crosswalk['regions'])} regions")
    
    return crosswalk


# ─────────────────────────────────────────────────────
# CLASSIFICATION HELPERS
# ─────────────────────────────────────────────────────

def _coerce_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _classify_planting(gdd: float, precip: float | None) -> str:
    """Classify planting outlook based on GDD accumulation and precipitation."""
    if gdd >= 15:
        if precip is not None and precip > 1.5:
            return "marginal"   # Good warmth but too wet
        return "favorable"
    elif gdd >= 5:
        return "marginal"
    else:
        return "unfavorable"


def _classify_sell_through_risk(avg_temp: float | None, precip: float | None) -> str:
    """
    Classify sell-through risk for nursery products.
    High risk: too cold (<45°F) or excessive rain (>2.0 in/week).
    Medium risk: borderline conditions.
    Low risk: good retail weather.
    """
    if avg_temp is None:
        return "medium"
    if avg_temp < 45.0:
        return "high"
    if precip is not None and precip > 2.0:
        return "high"
    if avg_temp < 55.0 or (precip is not None and precip > 1.2):
        return "medium"
    return "low"


def _region_risk_score(entries: list) -> float:
    """
    Compute a 0–100 weather risk score for a region.
    100 = maximum risk (all states cold/wet), 0 = all favorable.
    """
    if not entries:
        return 0.0
    risk_map = {"low": 0, "medium": 50, "high": 100}
    scores = [risk_map.get(e["sell_through_risk"], 50) for e in entries]
    return round(sum(scores) / len(scores), 1)


# ─────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────

def main():
    args = parse_args()
    
    print("=" * 60)
    print("Everde Shared Crosswalk Builder")
    print(f"Run time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Load weather
    print("\nStep 1: Loading weather data...")
    weather_states = load_weather_data(Path(args.weather_dir), debug=args.debug)
    if not weather_states:
        print("  WARNING: No weather state data loaded. Crosswalk will be weather-only stub.")
    else:
        print(f"  → {len(weather_states)} states loaded")
    
    # Load retail
    print("\nStep 2: Loading retail opportunity data...")
    retail_data = load_retail_data(Path(args.retail_json), debug=args.debug)
    if not retail_data:
        print("  WARNING: No retail data loaded. Crosswalk will have null retail fields.")
    else:
        regions_count = len(retail_data.get("regions", {}))
        print(f"  → Retail data loaded ({regions_count} regions)")
    
    # Build crosswalk
    print("\nStep 3: Building crosswalk...")
    crosswalk = build_crosswalk(weather_states, retail_data, debug=args.debug)
    
    # Write output
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    out_path = out_dir / "Sales_Weather_Crosswalk_latest.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(crosswalk, f, indent=2, default=str)
    
    size_kb = out_path.stat().st_size / 1024
    print(f"\n  ✓ Written: {out_path}")
    print(f"    Size:    {size_kb:.1f} KB")
    print(f"    States:  {crosswalk['summary']['total_states']}")
    print(f"    Regions: {len(crosswalk['regions'])}")
    print(f"    Week:    {crosswalk['week']}")
    print("\nDONE.")


if __name__ == "__main__":
    main()
