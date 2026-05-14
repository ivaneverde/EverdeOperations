import type { PortalReport, PortalSection } from "@/config/portal";
import { getReportSourceUncPath } from "@/config/portal";

type ReportShellProps = {
  section: PortalSection;
  report: PortalReport;
  children?: React.ReactNode;
  /** Full-bleed embed: no outer page scroll; iframe fills remaining height. */
  embedBody?: boolean;
};

export function ReportShell({
  section,
  report,
  children,
  embedBody = false,
}: ReportShellProps) {
  const fullPath = getReportSourceUncPath(report);

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
              <span className="font-medium text-zinc-800">Source:</span>{" "}
              <code className="rounded bg-white px-1 py-0.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200">
                {fullPath}
              </code>
            </span>
          )}
        </div>
        {report.sheetTabs && report.sheetTabs.length > 0 && (
          <div className="flex gap-1 overflow-x-auto px-4 py-2">
            {report.sheetTabs.map((tab, i) => (
              <button
                key={tab}
                type="button"
                disabled
                title="Tab navigation will mirror workbook sheets in a later iteration."
                className={
                  i === 0
                    ? "shrink-0 rounded-t border border-b-0 border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900"
                    : "shrink-0 rounded-t border border-transparent bg-zinc-100 px-3 py-1.5 text-xs text-zinc-500"
                }
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </header>
      <div
        className={
          embedBody
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto p-6"
        }
      >
        {children}
      </div>
    </div>
  );
}
