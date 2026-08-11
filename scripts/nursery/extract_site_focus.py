"""Parse weekly Site Focus Summary .docx from Inventory Metrics → JSON.

Drop files like Wk32_Site_Focus_Summary_Final.docx into:
  \\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\

Usage (repo root):
  python scripts/nursery/extract_site_focus.py
  python scripts/nursery/extract_site_focus.py path/to/Wk32_Site_Focus_Summary_Final.docx
"""

from __future__ import annotations

import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

W_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
DEFAULT_DATA_ROOT = r"\\192.168.190.10\Claude Sandbox\DataDrops"


def load_dotenv_local() -> None:
    env_path = repo_root() / ".env.local"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def metrics_dir() -> Path:
    root = os.environ.get("PORTAL_DATA_ROOT", DEFAULT_DATA_ROOT).strip()
    return Path(root) / "Inventory Metrics"

FARM_RE = re.compile(
    r"^([A-Z]{2,4})\s+[—–\-]+\s+(.+)$",
)
TOPIC_RE = re.compile(r"^([^:]{2,48}):\s+(.+)$", re.S)
WEEK_RE = re.compile(r"\bWeek\s+(\d{1,2})\b", re.I)
DATE_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b",
    re.I,
)
ALERT_RE = re.compile(
    r"urgent|must accelerate|weakest|spiked|far above|largest in the system|"
    r"requires urgent|investigate this week.?s spike|needs to accelerate|"
    r"needs to ramp|well behind",
    re.I,
)
OK_RE = re.compile(
    r"no action needed|on track|on goal|under goal|resolved|strong\b|"
    r"outstanding|good recovery|fine this week|well ahead|well under|"
    r"essentially on pace",
    re.I,
)
MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def para_texts(docx_path: Path) -> list[str]:
    with zipfile.ZipFile(docx_path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    out: list[str] = []
    for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        bits = [
            (t.text or "")
            for t in p.iter(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
            )
        ]
        line = "".join(bits).strip()
        if line:
            out.append(line)
    return out


def newest_site_focus(dir_path: Path) -> Path | None:
    if not dir_path.is_dir():
        return None
    files = [
        p
        for p in dir_path.iterdir()
        if p.is_file()
        and p.suffix.lower() == ".docx"
        and not p.name.startswith("~$")
        and re.search(r"site[\s_-]*focus", p.name, re.I)
    ]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def classify_tone(text: str) -> str:
    if ALERT_RE.search(text):
        return "alert"
    if OK_RE.search(text):
        return "ok"
    return "watch"


def iso_date_from_line(line: str) -> str | None:
    m = DATE_RE.search(line)
    if not m:
        return None
    month = MONTHS[m.group(1).lower()]
    return f"{m.group(3)}-{month:02d}-{int(m.group(2)):02d}"


def parse_paragraphs(lines: list[str], source_name: str) -> dict:
    title = lines[0] if lines else "Site Focus Summary"
    week_m = WEEK_RE.search(title) or (WEEK_RE.search(" ".join(lines[:4])) if lines else None)
    week = int(week_m.group(1)) if week_m else None

    report_date = None
    intro = None
    closing = None
    body_start = 1

    if len(lines) > 1:
        report_date = iso_date_from_line(lines[1])
        if "|" in lines[1]:
            intro = lines[1].split("|", 1)[-1].strip()
            body_start = 2
        elif report_date:
            body_start = 2

    regions: list[dict] = []
    current_region: dict | None = None
    current_farm: dict | None = None

    def ensure_region(name: str) -> dict:
        nonlocal current_region, current_farm
        current_region = {"name": name, "farms": []}
        regions.append(current_region)
        current_farm = None
        return current_region

    for line in lines[body_start:]:
        if re.match(r"^please reply\b", line, re.I):
            closing = line
            continue
        farm_m = FARM_RE.match(line)
        if farm_m:
            if current_region is None:
                ensure_region("Unspecified")
            current_farm = {
                "code": farm_m.group(1),
                "market": farm_m.group(2).strip(),
                "items": [],
            }
            current_region["farms"].append(current_farm)
            continue
        topic_m = TOPIC_RE.match(line)
        if topic_m and current_farm is not None:
            topic = topic_m.group(1).strip()
            text = topic_m.group(2).strip()
            current_farm["items"].append(
                {"topic": topic, "text": text, "tone": classify_tone(text)}
            )
            continue
        # Region headers are short labels without a sentence period.
        looks_like_region = (
            "." not in line
            and ":" not in line
            and len(line) <= 60
        )
        if looks_like_region:
            ensure_region(line)
            continue
        if current_farm is not None and current_farm["items"]:
            last = current_farm["items"][-1]
            last["text"] = f"{last['text']} {line}".strip()
            last["tone"] = classify_tone(last["text"])
            continue
        ensure_region(line)

    farm_count = sum(len(r["farms"]) for r in regions)
    alert_count = sum(
        1
        for r in regions
        for f in r["farms"]
        for it in f["items"]
        if it["tone"] == "alert"
    )

    return {
        "meta": {
            "title": title,
            "week": week,
            "reportDate": report_date,
            "intro": intro,
            "sourceName": source_name,
            "farmCount": farm_count,
            "regionCount": len(regions),
            "alertCount": alert_count,
            "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "regions": regions,
        "closing": closing,
    }


def write_outputs(payload: dict) -> list[Path]:
    root = repo_root()
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    paths = [
        root / "data" / "site_focus_data.json",
        root / "public" / "site_focus_data.json",
    ]
    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    return paths


def main() -> int:
    load_dotenv_local()
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    drop = metrics_dir()
    src = Path(arg) if arg else newest_site_focus(drop)
    if src is None or not src.is_file():
        print(
            f"No Site Focus .docx found in {drop}",
            file=sys.stderr,
        )
        return 2
    lines = para_texts(src)
    payload = parse_paragraphs(lines, src.name)
    paths = write_outputs(payload)
    meta = payload["meta"]
    print(f"Parsed: {src}")
    print(
        f"  Week {meta.get('week')} | {meta.get('reportDate')} | "
        f"{meta.get('farmCount')} farms | {meta.get('alertCount')} alerts"
    )
    for p in paths:
        print(f"Wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
