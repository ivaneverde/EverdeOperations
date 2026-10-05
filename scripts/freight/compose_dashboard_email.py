"""Compose the weekly Freight Dashboard email body (key takeaways + action items).

Every number is computed from this run's handoff-kit output
(_pipeline/_work/master_clean.pkl, quality log, source-integrity gate), so the
email always matches the attached workbook and the portal / Teams publish.

Writes an HTML fragment for send-dashboard-email.ps1.

Usage:
    python compose_dashboard_email.py <kit_root> [out.html]
    python compose_dashboard_email.py <kit_root> --verify    exit 3 if not safe to email

Env:
    FREIGHT_SHIP_CAP              last ship date in the build (YYYY-MM-DD); default = max Ship Date
    FREIGHT_DASHBOARD_EMAIL_INTRO opening line (default matches Ivan's 10/5/26 send)
"""
from __future__ import annotations

import html
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

SHIP_TYPE_LABELS = {
    "INTERNAL FREIGHT": "internal",
    "3rd Party Freight": "3rd-party",
    "CPU": "CPU",
}


def _esc(s: str) -> str:
    return html.escape((s or "").strip())


def _money(v: float) -> str:
    sign = "-" if v < 0 else ""
    v = abs(v)
    if v >= 1_000_000:
        return f"{sign}${v / 1_000_000:.2f}M"
    if v >= 10_000:
        return f"{sign}${v / 1_000:.0f}K"
    return f"{sign}${v:,.0f}"


def _md(d: date) -> str:
    return f"{d.month}/{d.day}"


def _week_window(cap: date) -> tuple[date, date]:
    return cap - timedelta(days=cap.weekday()), cap


def _loads_by_type(w: pd.DataFrame) -> dict[str, int]:
    if w.empty:
        return {}
    per_load = w.groupby("Tracking #")["Ship Type"].agg(lambda s: s.mode().iat[0])
    return per_load.value_counts().to_dict()


def _uncosted_internal(w: pd.DataFrame) -> pd.Series:
    internal = w[w["Ship Type"] == "INTERNAL FREIGHT"]
    if internal.empty:
        return pd.Series(dtype=int)
    per_load = internal.groupby("Tracking #").agg(cost=("Frt Cost", "sum"), site=("Site", "first"))
    return per_load[per_load["cost"] == 0]["site"].value_counts()


def _fmt_types(counts: dict[str, int]) -> str:
    parts = [f"{counts[k]} {label}" for k, label in SHIP_TYPE_LABELS.items() if counts.get(k)]
    other = sum(v for k, v in counts.items() if k not in SHIP_TYPE_LABELS)
    if other:
        parts.append(f"{other} other")
    return ", ".join(parts)


def _n_loads(n: int) -> str:
    return f"{n} internal load{'' if n == 1 else 's'}"


def _fmt_sites(s: pd.Series) -> str:
    return ", ".join(f"{site} {n}" for site, n in s.items())


def _quality_diff(kit: Path) -> tuple[int, int] | None:
    qpath = kit / "_pipeline" / "_quality_log" / "quality_summary_latest.txt"
    if not qpath.is_file():
        return None
    qtxt = qpath.read_text(encoding="utf-8", errors="replace")
    m = re.search(
        r"DATA QUALITY DIFF — 2026.*?Newly excluded this run:\s+(\d+).*?Re-included this run[^:]*:\s+(\d+)",
        qtxt,
        re.S,
    )
    return (int(m.group(1)), int(m.group(2))) if m else None


def compose(kit: Path) -> tuple[list[str], list[str], str]:
    takeaways: list[str] = []
    actions: list[str] = []

    pkl = kit / "_pipeline" / "_work" / "master_clean.pkl"
    df = pd.read_pickle(pkl)
    df["Ship Date"] = pd.to_datetime(df["Ship Date"]).dt.date

    cap_env = (os.environ.get("FREIGHT_SHIP_CAP") or "").strip()
    cap = date.fromisoformat(cap_env) if cap_env else df["Ship Date"].max()
    start, end = _week_window(cap)
    prev_start, prev_end = start - timedelta(days=7), end - timedelta(days=7)
    window = f"{_md(start)}–{_md(end)}"

    wk = df[(df["Ship Date"] >= start) & (df["Ship Date"] <= end)]
    prev = df[(df["Ship Date"] >= prev_start) & (df["Ship Date"] <= prev_end)]
    ytd = df[df["Ship Date"] <= end]

    takeaways.append(
        f"Data runs through Friday {cap.month}/{cap.day}/{cap:%y}: {len(ytd):,} rows "
        f"({ytd['Tracking #'].nunique():,} loads) YTD."
    )

    if wk.empty:
        actions.append(f"No ship dates in the new week ({window}) — confirm Juanita's Load Board was refreshed.")
    else:
        types = _loads_by_type(wk)
        n_loads = sum(types.values())
        prev_loads = prev["Tracking #"].nunique()
        delta = ""
        if prev_loads:
            diff = n_loads - prev_loads
            delta = f" ({'+' if diff >= 0 else ''}{diff} vs {_md(prev_start)}–{_md(prev_end)})"
        takeaways.append(
            f"New week {window}: {n_loads} loads{delta} — {_fmt_types(types)}; {len(wk):,} rows."
        )

        rev, rec, cost = wk["Revenue"].sum(), wk["Frt Recovery (Mixed)"].sum(), wk["Frt Cost"].sum()
        net = wk["Net Recovery"].sum()
        pct = f" ({rec / cost:.0%} recovered)" if cost else ""
        takeaways.append(
            f"Week {window}: {_money(rev)} revenue, {_money(rec)} freight recovery vs "
            f"{_money(cost)} freight cost{pct}; net {_money(net)}."
        )

        by_region = wk.groupby("Region")["Net Recovery"].sum().sort_values()
        worst = by_region[by_region < 0]
        if not worst.empty:
            region, val = worst.index[0], worst.iloc[0]
            takeaways.append(f"Largest net freight gap this week: {region} at {_money(val)}.")

        unc = _uncosted_internal(wk)
        if unc.sum():
            actions.append(
                f"{_n_loads(int(unc.sum()))} in {window} {'has' if int(unc.sum()) == 1 else 'have'} no freight cost yet "
                f"({_fmt_sites(unc)}). Week totals will move once costs post."
            )

    y_rec, y_cost, y_net = ytd["Frt Recovery (Mixed)"].sum(), ytd["Frt Cost"].sum(), ytd["Net Recovery"].sum()
    y_pct = f" ({y_rec / y_cost:.0%})" if y_cost else ""
    takeaways.append(
        f"YTD 2026: {_money(ytd['Revenue'].sum())} revenue, {_money(y_rec)} recovered of "
        f"{_money(y_cost)} freight cost{y_pct}; net {_money(y_net)}."
    )

    if not prev.empty:
        prev_unc = _uncosted_internal(prev)
        if prev_unc.sum():
            actions.append(
                f"{_n_loads(int(prev_unc.sum()))} from {_md(prev_start)}–{_md(prev_end)} "
                f"{'is' if int(prev_unc.sum()) == 1 else 'are'} still uncosted "
                f"({_fmt_sites(prev_unc)})."
            )

    q = _quality_diff(kit)
    if q:
        excl, reinc = q
        takeaways.append(f"Quality filter: {excl} loads newly excluded, {reinc} re-included this run.")
        if excl >= 25:
            actions.append(
                f"{excl} loads were newly excluded by the quality filter — spot-check the Data Quality tab."
            )

    stop = kit / "_pipeline" / "_quality_log" / "source_integrity_STOP.txt"
    if stop.is_file():
        actions.insert(0, "Source-integrity gate fired — do not treat this workbook as final. See source_integrity_STOP.txt.")

    if not actions:
        actions.append("No open data issues this week.")

    return takeaways[:7], actions[:5], window


def verify_ready(kit: Path) -> list[str]:
    """Reasons the build is not safe to email; empty list = ready."""
    problems: list[str] = []
    stop = kit / "_pipeline" / "_quality_log" / "source_integrity_STOP.txt"
    if stop.is_file():
        problems.append("source-integrity gate fired (source_integrity_STOP.txt)")
    pkl = kit / "_pipeline" / "_work" / "master_clean.pkl"
    if not pkl.is_file():
        return problems + ["master_clean.pkl missing (kit build did not finish)"]
    df = pd.read_pickle(pkl)
    ship = pd.to_datetime(df["Ship Date"]).dt.date
    cap_env = (os.environ.get("FREIGHT_SHIP_CAP") or "").strip()
    cap = date.fromisoformat(cap_env) if cap_env else ship.max()
    start, end = _week_window(cap)
    wk_rows = int(((ship >= start) & (ship <= end)).sum())
    if wk_rows == 0:
        problems.append(f"no ship dates in the new week {_md(start)}–{_md(end)} (Load Board not refreshed?)")
    if ship.max() < end - timedelta(days=1):
        problems.append(f"latest ship date {ship.max()} is before {end - timedelta(days=1)} (new week incomplete)")
    return problems


def to_html(takeaways: list[str], actions: list[str], window: str) -> str:
    intro = (
        os.environ.get("FREIGHT_DASHBOARD_EMAIL_INTRO")
        or "Attached has been updated and I got the below comments."
    ).strip()
    t = "\n".join(f"<li>{_esc(x)}</li>" for x in takeaways)
    a = "\n".join(f"<li>{_esc(x)}</li>" for x in actions)
    return (
        f"<p>{_esc(intro)}</p>\n"
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
    if len(sys.argv) > 2 and sys.argv[2] == "--verify":
        problems = verify_ready(kit)
        for p in problems:
            print(f"NOT READY: {p}", file=sys.stderr)
        if not problems:
            print("READY")
        return 3 if problems else 0
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else kit / "_pipeline" / "_work" / "dashboard_email_body.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    takeaways, actions, window = compose(kit)
    out.write_text(to_html(takeaways, actions, window), encoding="utf-8")
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
