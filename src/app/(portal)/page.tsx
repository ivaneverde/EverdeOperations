import Link from "next/link";
import {
  getSectionDisplayNumber,
  isSectionOnly,
  PORTAL_SECTIONS,
} from "@/config/portal";

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
          <p
            className="mt-5 max-w-3xl border-t border-white/20 pt-4 text-xs leading-relaxed text-zinc-300"
            role="note"
          >
            <span className="font-semibold text-[var(--everde-gold)]">
              Phase note:
            </span>{" "}
            Local development only for fast design and testing. Later this will
            move to an online portal for broad access on phones, tablets, and
            desktop browsers.
          </p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          {PORTAL_SECTIONS.map((section) => {
            const only = isSectionOnly(section);
            const first = section.reports[0];
            const firstHref = first?.navHref?.trim();
            const href = only
              ? `/${section.id}`
              : first
                ? firstHref || `/${section.id}/${first.slug}`
                : `/${section.id}`;
            const sectionNum = getSectionDisplayNumber(section);
            return (
              <article
                key={section.id}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
              >
                {sectionNum != null ? (
                  <p className="text-xs font-semibold text-[var(--everde-forest)]">
                    Section {sectionNum}
                  </p>
                ) : null}
                <h2
                  className={
                    sectionNum != null
                      ? "mt-1 text-lg font-semibold text-zinc-900"
                      : "text-lg font-semibold text-zinc-900"
                  }
                >
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
                  {(only || first) && (
                    <Link
                      href={href}
                      className="inline-flex items-center rounded-md bg-[var(--everde-forest)] px-3 py-2 text-sm font-medium text-white hover:bg-[#143524]"
                    >
                      {only ? "Open section" : "Open first report"}
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
