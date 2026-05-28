#!/usr/bin/env python3
"""Patch Everde freight dashboard HTML for dynamic YTD date labels from D.meta."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TARGETS = [
    REPO / "scripts/freight/claude-handoff/Everde_Freight_Dashboard_YTD_2026.html",
    REPO / "public/Everde_Freight_Dashboard_YTD_2026_1.html",
]

OLD_BADGE = '<div class="badge">YTD APR 2026</div>'
NEW_BADGE = '<div class="badge" id="sidebar-ytd-badge">YTD 2026</div>'

OLD_COVER_SUB = (
    '<div class="cover-sub">5-Year History (2022–2026) · YTD through April 25, 2026</div>'
)
NEW_COVER_SUB = '<div class="cover-sub" id="cover-sub">Loading period…</div>'

OLD_CONST_BLOCK = """const YTD_MONTHS = ['01-JAN','02-FEB','03-MAR','04-APR'];
const YEARS = [2022,2023,2024,2025,2026];
const REGIONS = ['N. CA','S. CA','TX','FL','FOR'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_KEYS = ['01-JAN','02-FEB','03-MAR','04-APR','05-MAY','06-JUN','07-JUL','08-AUG','09-SEP','10-OCT','11-NOV','12-DEC'];"""

NEW_CONST_BLOCK = """const YEARS = [2022,2023,2024,2025,2026];
const REGIONS = ['N. CA','S. CA','TX','FL','FOR'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_KEYS = ['01-JAN','02-FEB','03-MAR','04-APR','05-MAY','06-JUN','07-JUL','08-AUG','09-SEP','10-OCT','11-NOV','12-DEC'];

function getYtdMonthKeys() {
  const m = D && D.meta && D.meta.ytd_months;
  if (m && m.length) return m;
  return ['01-JAN','02-FEB','03-MAR','04-APR'];
}
function monthLabelForKey(mk) {
  const i = MONTH_KEYS.indexOf(mk);
  return i >= 0 ? MONTH_LABELS[i] : (mk || '');
}
function updateFreightDateLabels() {
  if (!D || !D.meta) return;
  const meta = D.meta;
  const subEl = document.getElementById('cover-sub');
  if (subEl && meta.ytd_subtitle) subEl.textContent = meta.ytd_subtitle;
  const badgeEl = document.getElementById('sidebar-ytd-badge');
  if (badgeEl && meta.sidebar_badge) badgeEl.textContent = meta.sidebar_badge;
}"""

OLD_RENDER_COVER = """function renderCover() {
  const k = D.company_kpis['2026'];
  const el = document.getElementById('cover-kpis');
  const items = [
    { lbl: 'Total Loads', val: fmt.int(k.loads) },
    { lbl: 'Total Revenue', val: fmt.dollarM(k.revenue) },
    { lbl: 'Freight Cost', val: fmt.dollarM(k.cost) },
    { lbl: 'Net Recovery', val: fmt.dollarM(k.net) },
    { lbl: 'Total EUs', val: fmt.int(k.eus) },
    { lbl: 'Cost / Mile', val: fmt.cpm(k.cost_per_mile) },
  ];
  el.innerHTML = items.map(i => `
    <div class="cover-meta">
      <div class="val">${i.val}</div>
      <div class="lbl">${i.lbl}</div>
    </div>`).join('');
}"""

NEW_RENDER_COVER = """function renderCover() {
  if (!D || !D.company_kpis || !D.company_kpis['2026']) return;
  const k = D.company_kpis['2026'];
  const el = document.getElementById('cover-kpis');
  if (!el) return;
  const items = [
    { lbl: 'Total Loads', val: fmt.int(k.loads) },
    { lbl: 'Total Revenue', val: fmt.dollarM(k.revenue) },
    { lbl: 'Freight Cost', val: fmt.dollarM(k.cost) },
    { lbl: 'Net Recovery', val: fmt.dollarM(k.net) },
    { lbl: 'Total EUs', val: fmt.int(k.eus) },
    { lbl: 'Cost / Mile', val: fmt.cpm(k.cost_per_mile) },
  ];
  el.innerHTML = items.map(i => `
    <div class="cover-meta">
      <div class="val">${i.val}</div>
      <div class="lbl">${i.lbl}</div>
    </div>`).join('');
  updateFreightDateLabels();
}"""

OLD_YTD_MONTH_KEYS = """  const ytdMonthKeys = ['01-JAN','02-FEB','03-MAR','04-APR'];
  ytdMonthKeys.forEach((mk, mi) => {
    html += `<tr><td>${MONTH_LABELS[mi]}</td>`;"""

NEW_YTD_MONTH_KEYS = """  getYtdMonthKeys().forEach((mk) => {
    html += `<tr><td>${monthLabelForKey(mk)}</td>`;"""


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in (
        (OLD_BADGE, NEW_BADGE),
        (OLD_COVER_SUB, NEW_COVER_SUB),
        (OLD_CONST_BLOCK, NEW_CONST_BLOCK),
        (OLD_RENDER_COVER, NEW_RENDER_COVER),
        (OLD_YTD_MONTH_KEYS, NEW_YTD_MONTH_KEYS),
    ):
        if old not in text:
            print(f"  skip (already patched?): {old[:48]}…", file=sys.stderr)
        else:
            text = text.replace(old, new, 1)
    if text == orig:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def main() -> int:
    changed = 0
    for path in TARGETS:
        if not path.is_file():
            print(f"Missing: {path}", file=sys.stderr)
            continue
        if patch_file(path):
            print(f"Patched: {path}")
            changed += 1
        else:
            print(f"No changes: {path}")
    return 0 if changed else 1


if __name__ == "__main__":
    raise SystemExit(main())
