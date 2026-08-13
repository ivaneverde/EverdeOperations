#!/usr/bin/env python3
"""Refresh Open-Meteo 7-day forecasts into public/weather_dashboard_data.json (forecast only)."""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "weather_dashboard_data.json"


def fetch_city(lat: float, lon: float) -> dict:
    qs = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
            "timezone": "America/Los_Angeles",
            "forecast_days": 7,
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{qs}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    daily = data.get("daily") or {}
    return {
        "time": daily.get("time") or [],
        "temperature_2m_max": daily.get("temperature_2m_max") or [],
        "temperature_2m_min": daily.get("temperature_2m_min") or [],
        "precipitation_sum": daily.get("precipitation_sum") or [],
        "weathercode": daily.get("weathercode") or [],
    }


def main() -> int:
    if not OUT.is_file():
        print(f"Missing {OUT}", file=sys.stderr)
        return 1
    doc = json.loads(OUT.read_text(encoding="utf-8"))
    weather = doc.setdefault("weather", {})
    forecast = weather.get("forecast") or {}
    if not forecast:
        print("No forecast cities in JSON", file=sys.stderr)
        return 1

    today = date.today().isoformat()
    for name, city in forecast.items():
        lat = float(city.get("lat"))
        lon = float(city.get("lon"))
        print(f"  {name} ({lat},{lon})...", flush=True)
        city["forecast"] = fetch_city(lat, lon)

    weather["forecast"] = forecast
    weather["fetched_date"] = today
    weather["today"] = today
    # keep archive / crosswalk as historical context
    OUT.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"Updated {OUT} as_of={today}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
