"""excel_recalc.py — cache formula results so dashboards are not blank on open.

openpyxl writes SUMIFS with no cached value. Excel then shows blank KPIs until a
filter change forces recalculation. Open with Excel COM, CalculateFullRebuild, Save.
"""
from __future__ import annotations

import os
import sys
import time


def recalc(path: str) -> None:
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        sys.exit(f"Not found: {path}")

    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    excel = None
    wb = None
    t0 = time.time()
    try:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.AskToUpdateLinks = False
        excel.EnableEvents = False
        excel.ScreenUpdating = False
        print(f"Opening {path} in Excel COM...", flush=True)
        wb = excel.Workbooks.Open(path, UpdateLinks=0, ReadOnly=False)
        excel.Calculation = -4105  # xlCalculationAutomatic
        wb.ForceFullCalculation = True
        print("CalculateFullRebuild...", flush=True)
        excel.CalculateFullRebuild()
        print("Saving cached values...", flush=True)
        wb.Save()
        wb.Close(SaveChanges=True)
        wb = None
        print(f"Recalc OK ({time.time() - t0:.1f}s)", flush=True)
    finally:
        if wb is not None:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        if excel is not None:
            try:
                excel.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    recalc(sys.argv[1])
