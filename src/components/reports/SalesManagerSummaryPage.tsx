"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalReport, PortalSection } from "@/config/portal";
import { getReportSourceUncPath } from "@/config/portal";
import {
  SALES_MANAGER_SUMMARY_DEFAULT_CSV_ROOT,
  SALES_MANAGER_SUMMARY_SHEETS,
  type SalesManagerSummarySheetSlug,
} from "@/config/salesManagerSummarySheets";

type Props = {
  section: PortalSection;
  report: PortalReport;
};

type ApiOk = {
  sheet: SalesManagerSummarySheetSlug;
  label: string;
  rows: string[][];
};

export function SalesManagerSummaryPage({ section, report }: Props) {
  const fullPath = getReportSourceUncPath(report);

  const [active, setActive] = useState<SalesManagerSummarySheetSlug>(
    "executive_summary",
  );
  const [rows, setRows] = useState<string[][]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSheet = useCallback(async (slug: SalesManagerSummarySheetSlug) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/reports/sales-manager-summary?sheet=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as ApiOk & { error?: string; expectedPath?: string };
      if (!res.ok) {
        const hint =
          res.status === 404 && json.expectedPath
            ? ` Expected file: ${json.expectedPath}`
            : "";
        setRows([]);
        setLoadError((json.error ?? "Request failed") + hint);
        return;
      }
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
      setLoadError("Network error while loading CSV.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSheet(active);
  }, [active, loadSheet]);

  const activeIndex = SALES_MANAGER_SUMMARY_SHEETS.findIndex(
    (s) => s.slug === active,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--everde-canvas)]">
      <header className="border-b border-[var(--everde-border)] bg-white shadow-sm">
        <div className="everde-strip px-6 py-3 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--everde-gold)]">
            {section.title}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{report.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-2 text-xs text-zinc-600">
          <span>
            <span className="font-medium text-zinc-800">Share folder:</span>{" "}
            {section.shareFolder}
          </span>
          {fullPath && (
            <span className="min-w-0 break-all">
              <span className="font-medium text-zinc-800">Source workbook:</span>{" "}
              <code className="rounded bg-white px-1 py-0.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200">
                {fullPath}
              </code>
            </span>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-zinc-100 bg-zinc-50/80 px-4 py-2">
          {SALES_MANAGER_SUMMARY_SHEETS.map((tab, i) => (
            <button
              key={tab.slug}
              type="button"
              onClick={() => setActive(tab.slug)}
              className={
                i === activeIndex
                  ? "shrink-0 rounded-t border border-b-0 border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900"
                  : "shrink-0 rounded-t border border-transparent bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <p className="font-semibold">Pilot data path (CSV)</p>
          <p className="mt-1 text-amber-900/90">
            Each tab reads a UTF-8 CSV from the server folder{" "}
            <code className="rounded bg-white/80 px-1 py-0.5 ring-1 ring-amber-200">
              PORTAL_CSV_ROOT
            </code>{" "}
            (default:{" "}
            <code className="break-all rounded bg-white/80 px-1 py-0.5 ring-1 ring-amber-200">
              {SALES_MANAGER_SUMMARY_DEFAULT_CSV_ROOT}
            </code>
            ). Export each Excel sheet as CSV using the filenames listed in{" "}
            <code className="rounded bg-white/80 px-1 py-0.5 ring-1 ring-amber-200">
              src/config/salesManagerSummarySheets.ts
            </code>{" "}
            so displayed values match the workbook.
          </p>
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {loadError}
          </div>
        )}

        {loading && (
          <p className="text-sm text-zinc-500">Loading sheet…</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-[11px] text-zinc-800">
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={`r-${ri}`}
                    className={
                      ri === 0
                        ? "bg-zinc-100 font-semibold text-zinc-900"
                        : ri % 2 === 1
                          ? "bg-zinc-50/80"
                          : "bg-white"
                    }
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={`c-${ri}-${ci}`}
                        className="max-w-[min(280px,28vw)] whitespace-pre-wrap border-b border-r border-zinc-200 px-2 py-1 align-top last:border-r-0"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && rows.length === 0 && (
          <p className="text-sm text-zinc-500">No rows in this CSV yet.</p>
        )}
      </div>
    </div>
  );
}
