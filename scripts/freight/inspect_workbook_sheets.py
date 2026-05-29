#!/usr/bin/env python3
"""Quick inspect Jonathan May 28 freight dashboard workbook."""
import sys
import pandas as pd
from pathlib import Path

p = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\temp\Everde_Freight_Dashboard_2026-05-28.xlsx")
xl = pd.ExcelFile(p)

df = pd.read_excel(p, "Top Opportunities", header=4)
print("top_opps rows", len(df), "cols", list(df.columns)[:20])
print("weeks", sorted(df["Week"].dropna().unique())[:15])
print(df.head(1).T)

lw_name = next(s for s in xl.sheet_names if "Last Week" in s)
lw = pd.read_excel(p, lw_name, header=9)
print("last_week rows", len(lw), "cols", list(lw.columns)[:15])

raw = pd.read_excel(p, "Reference", header=None)
for i in range(len(raw)):
    vals = [x for x in raw.iloc[i].values if pd.notna(x)]
    if len(vals) == 2 and isinstance(vals[1], (int, float)):
        site = str(vals[0]).strip()
        if len(site) <= 4 and site.isalpha():
            print("BUD", site, vals[1])
