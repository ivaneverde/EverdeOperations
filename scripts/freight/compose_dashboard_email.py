"""Compose a Jonathan-style Freight Dashboard email body (takeaways + action items).

No TEST banner. Writes HTML fragment for send-dashboard-email.ps1.

Usage:
    python compose_dashboard_email.py <kit_root> [out.html]
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
from pathlib import Path


def _esc(s: str) -> str:
    return html.escape((s or "").strip())


def _para_after(detail: str, marker: str) -> str:
    if not detail or marker.lower() not in detail.lower():
        return ""
    idx = detail.lower().find(marker.lower())
    chunk = detail[idx:]
    para = chunk.split("\n\n", 1)[0]
    para = re.sub(r"\s+", " ", para).strip()
    if len(para) > 420:
        para = para[:417].rstrip() + "…"
    return para


def compose(kit: Path) -> tuple[list[str], list[str]]:
    takeaways: list[str] = []
    actions: list[str] = []

    cap = (os.environ.get("FREIGHT_SHIP_CAP") or "").strip()
    if cap:
        takeaways.append(f"Ship dates capped at Friday {cap} so prior-week Thursday/Friday stay in.")

    ch_path = kit / "_pipeline" / "change_history.json"
    if ch_path.is_file():
        data = json.loads(ch_path.read_text(encoding="utf-8"))
        entries = data.get("entries") or []
        latest = next((e for e in entries if (e.get("type") or "") == "data"), None)
        if latest:
            summary = (latest.get("summary") or "").strip()
            if summary:
                takeaways.append(summary)
            detail = latest.get("detail") or ""
            for marker in ("NEW WINDOW:", "SOURCE INTEGRITY:", "UNCOSTED", "DIESEL:"):
                para = _para_after(detail, marker)
                if para and para not in takeaways:
                    takeaways.append(para)
            for marker in ("OPEN:", "BRA-leg", "UNCOSTED NEW-WEEK", "UNCOSTED LOADS"):
                para = _para_after(detail, marker)
                if para and para not in actions and not any(para in a or a in para for a in actions):
                    actions.append(para)

    qpath = kit / "_pipeline" / "_quality_log" / "quality_summary_latest.txt"
    if qpath.is_file():
        qtxt = qpath.read_text(encoding="utf-8", errors="replace")
        m = re.search(
            r"DATA QUALITY DIFF — 2026.*?Newly excluded this run:\s+(\d+).*?Re-included this run[^:]*:\s+(\d+)",
            qtxt,
            re.S,
        )
        if m:
            takeaways.append(
                f"2026 quality filter: {m.group(1)} newly excluded loads, {m.group(2)} re-included this run."
            )

    stop = kit / "_pipeline" / "_quality_log" / "source_integrity_STOP.txt"
    if stop.is_file():
        actions.insert(0, "Source-integrity gate fired — do not treat this workbook as published. See source_integrity_STOP.txt.")

    if not takeaways:
        takeaways.append("Freight Dashboard rebuilt from this week's Juanita YTD Load Board.")
    if not actions:
        actions.append("Review the attached workbook (region tabs + Exec Summary) before forwarding to the team.")

    # Keep the email short
    return takeaways[:6], actions[:5]


def to_html(takeaways: list[str], actions: list[str]) -> str:
    t = "\n".join(f"<li>{_esc(x)}</li>" for x in takeaways)
    a = "\n".join(f"<li>{_esc(x)}</li>" for x in actions)
    return (
        "<p>Hi Ivan,</p>\n"
        "<p><b>Key takeaways</b></p>\n"
        f"<ul>\n{t}\n</ul>\n"
        "<p><b>Action items</b></p>\n"
        f"<ul>\n{a}\n</ul>\n"
    )


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    kit = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else kit / "_pipeline" / "_work" / "dashboard_email_body.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    takeaways, actions = compose(kit)
    out.write_text(to_html(takeaways, actions), encoding="utf-8")
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
