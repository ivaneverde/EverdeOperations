import type { PortalReport } from "@/config/portal";

export function ReportPlaceholder({ report }: { report: PortalReport }) {
  return (
    <div className="space-y-6">
      {report.notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Note: </span>
          {report.notes}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {["Snapshot", "Variance vs plan", "Recommended action"].map(
          (label, i) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {["—", "—", "—"][i]}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Live metrics will bind here after ingestion / modeling.
              </p>
            </div>
          ),
        )}
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">
            Analysis canvas (placeholder)
          </h2>
          <span className="text-xs text-zinc-500">
            Charts & tables mirror Excel layout in Phase 2
          </span>
        </div>
        <div className="h-64 bg-gradient-to-br from-zinc-50 to-zinc-100 p-6 text-sm text-zinc-600">
          <p>
            This view is wired to the correct workbook in configuration. Next
            steps: extract sheet ranges (or export CSV), define semantic
            models (weather joins, allocation stages, lane dimensions), and
            render with the same hierarchy as the Excel tabs above.
          </p>
        </div>
      </section>
    </div>
  );
}
