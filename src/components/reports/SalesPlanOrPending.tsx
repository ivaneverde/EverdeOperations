import type { PortalReport } from "@/config/portal";
import { getReportSourceUncPath } from "@/config/portal";

export function SalesPlanOrPending({ report }: { report: PortalReport }) {
  const unc = getReportSourceUncPath(report);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950">
        <p className="font-semibold">Oregon dashboard not built yet</p>
        <p className="mt-2 leading-relaxed">
          NOR CAL is live (workbook + Python model + portal embed + Azure Blob).
          Oregon was listed in the roadmap but was never compiled — this page is a
          placeholder until the OR workbook and model exist on the share.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">What is blocking</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
          <li>
            <strong>OR forward model</strong> — no <code>or_forward_patched.py</code>{" "}
            (NOR CAL uses <code>nor_cal_forward_patched.py</code>).
          </li>
          <li>
            <strong>OR output workbook</strong> — not found under{" "}
            <code>DataDrops\Sales Plan Review\</code> on the share (only NOR CAL
            forward-looking file is there today).
          </li>
          <li>
            <strong>Portal embed</strong> — this report has no{" "}
            <code>salesPlanHtmlTab</code>; NOR CAL sub-pages use the live HTML
            dashboard.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">What you can do</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
          <li>
            Run a <strong>Claude</strong> session to build the OR workbook (same
            pattern as NOR CAL handoff) and drop it on the share at the path below.
          </li>
          <li>
            Tell Cursor to wire OR: separate Blob JSON + embed, or reuse NOR CAL
            tabs if sheet layout matches.
          </li>
          <li>
            Repo doc: <code>scripts/sales-plan-review/OR_ROLLOUT.md</code>
          </li>
        </ol>
      </section>

      {unc && (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">Configured source:</span>{" "}
          <code className="break-all rounded bg-zinc-100 px-1 py-0.5">{unc}</code>
        </p>
      )}

      {report.notes && (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">Config note:</span>{" "}
          {report.notes}
        </p>
      )}
    </div>
  );
}
