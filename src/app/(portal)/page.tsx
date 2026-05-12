import Link from "next/link";
import { PORTAL_SECTIONS } from "@/config/portal";

export default function PortalHomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--everde-canvas)] p-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="everde-strip rounded-lg px-8 py-8 text-white shadow">
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--everde-gold)]">
            Everde Growers
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            AI Operations Portal
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-200">
            A single entry point for retail opportunity, sales plan coverage,
            freight economics, and Teams-based communication. Each subsection
            maps to an existing workbook on the internal share while we stand
            up automated ingestion and interactive analytics.
          </p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          {PORTAL_SECTIONS.map((section, i) => {
            const first = section.reports[0];
            return (
              <article
                key={section.id}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-semibold text-[var(--everde-forest)]">
                  Section {i + 1}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  {section.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">
                  {section.summary}
                </p>
                <p className="mt-3 text-xs text-zinc-500">
                  Share folder:{" "}
                  <span className="font-medium text-zinc-700">
                    {section.shareFolder}
                  </span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {first && (
                    <Link
                      href={`/${section.id}/${first.slug}`}
                      className="inline-flex items-center rounded-md bg-[var(--everde-forest)] px-3 py-2 text-sm font-medium text-white hover:bg-[#143524]"
                    >
                      Open first report
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
