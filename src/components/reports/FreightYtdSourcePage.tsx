import Link from "next/link";
import { ReportShell } from "@/components/ReportShell";
import type { PortalReport, PortalSection } from "@/config/portal";
import { getReportSourceUncPath } from "@/config/portal";

type Props = {
  section: PortalSection;
  report: PortalReport;
};

/** YTD `.xlsb` source — pipeline input; dashboard is shown on the sibling report. */
export function FreightYtdSourcePage({ section, report }: Props) {
  const fullPath = getReportSourceUncPath(report);

  return (
    <ReportShell section={section} report={report}>
      <div className="max-w-2xl space-y-4 text-sm text-zinc-700">
        <p>
          This workbook is the <span className="font-medium">YTD data input</span> for
          the freight pipeline. The live file sits at the{" "}
          <span className="font-medium">DataDrops</span> share root (see path below).
          Older snapshots can go under{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">Archive</code> or{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">Freight/archive/data</code>
          . After replacing the <code className="rounded bg-zinc-100 px-1">.xlsb</code>
          , run{" "}
          <code className="rounded bg-zinc-100 px-1">python update.py</code> from{" "}
          <code className="rounded bg-zinc-100 px-1">Freight/_pipeline</code> so the
          dashboard HTML under <code className="rounded bg-zinc-100 px-1 text-xs">Freight/</code>{" "}
          is regenerated.
        </p>
        {fullPath && (
          <p className="break-all">
            <span className="font-medium text-zinc-900">File:</span>{" "}
            <code className="rounded bg-zinc-50 px-1 py-0.5 text-xs ring-1 ring-zinc-200">
              {fullPath}
            </code>
          </p>
        )}
        <p>
          <Link
            href="/load-board-freight/everde-freight-dashboard"
            className="font-medium text-[var(--everde-forest)] underline-offset-2 hover:underline"
          >
            Open Everde Freight Dashboard
          </Link>{" "}
          (embedded HTML export).
        </p>
      </div>
    </ReportShell>
  );
}
