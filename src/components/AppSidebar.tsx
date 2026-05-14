"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import packageJson from "../../package.json";
import {
  getSectionNumberPrefix,
  isSectionOnly,
  PORTAL_SECTIONS,
} from "@/config/portal";

function pathForReport(sectionId: string, reportSlug: string) {
  return `/${sectionId}/${reportSlug}`;
}

function hrefForReport(
  sectionId: string,
  slug: string,
  navHref: string | undefined,
) {
  const trimmed = navHref?.trim();
  if (trimmed) return trimmed;
  return pathForReport(sectionId, slug);
}

export function AppSidebar() {
  const pathname = usePathname();

  const { activeSectionId, activeReportSlug } = useMemo(() => {
    if (!pathname) return { activeSectionId: null, activeReportSlug: null };
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return { activeSectionId: null, activeReportSlug: null };
    if (parts.length === 1) {
      return { activeSectionId: parts[0], activeReportSlug: null };
    }
    return { activeSectionId: parts[0], activeReportSlug: parts[1] };
  }, [pathname]);

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-[var(--everde-border)] bg-[var(--everde-sidebar)] text-[var(--everde-sidebar-fg)]">
      <div className="shrink-0 border-b border-[var(--everde-border)] px-3 py-2">
        <Link href="/" className="block">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--everde-gold)]">
            <span>Everde</span>
            <span
              className="font-mono text-[9px] font-medium normal-case tracking-normal text-zinc-500"
              title={`Portal version ${packageJson.version}`}
            >
              v{packageJson.version}
            </span>
          </p>
          <p className="text-base font-semibold leading-tight text-white">
            AI Operations
          </p>
        </Link>
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-400">
          Executive dashboards migrated from Excel prototypes.
        </p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 text-[11px] leading-tight">
        <ol className="space-y-0.5">
          {PORTAL_SECTIONS.map((section) => {
            const only = isSectionOnly(section);
            const sectionHref = `/${section.id}`;
            const sectionActive =
              activeSectionId === section.id &&
              (only ? activeReportSlug === null : false);
            const sectionNum = getSectionNumberPrefix(section);

            return (
              <li key={section.id} className="min-w-0">
                {only ? (
                  <Link
                    href={sectionHref}
                    className={
                      sectionActive
                        ? "block rounded-md bg-[var(--everde-gold)]/15 px-1.5 py-1 text-white ring-1 ring-[var(--everde-gold)]/40"
                        : "block rounded-md px-1.5 py-1 text-zinc-200 hover:bg-white/5 hover:text-white"
                    }
                  >
                    {sectionNum ? (
                      <span className="text-[var(--everde-gold)] tabular-nums">
                        {sectionNum}{" "}
                      </span>
                    ) : null}
                    <span className="font-medium">{section.title}</span>
                  </Link>
                ) : (
                  <>
                    <div className="px-1.5 py-0.5 text-zinc-300">
                      {sectionNum ? (
                        <span className="text-[var(--everde-gold)] tabular-nums">
                          {sectionNum}{" "}
                        </span>
                      ) : null}
                      <span className="font-medium text-zinc-100">
                        {section.title}
                      </span>
                    </div>
                    <ul className="ml-2 border-l border-white/10 pl-1.5">
                      {section.reports
                        .filter((r) => !r.hideFromNav)
                        .map((r) => {
                        const href = hrefForReport(
                          section.id,
                          r.slug,
                          r.navHref,
                        );
                        const isActive =
                          pathname === href ||
                          (!r.navHref?.trim() &&
                            activeSectionId === section.id &&
                            activeReportSlug === r.slug);
                        return (
                          <li key={r.slug}>
                            <Link
                              href={href}
                              className={
                                isActive
                                  ? "flex items-center gap-1.5 rounded-md bg-[var(--everde-gold)]/15 px-1.5 py-0.5 text-white ring-1 ring-[var(--everde-gold)]/40"
                                  : "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-zinc-300 hover:bg-white/5 hover:text-white"
                              }
                            >
                              {r.navAccent ? (
                                <span
                                  aria-hidden
                                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/20"
                                  style={{ backgroundColor: `#${r.navAccent}` }}
                                />
                              ) : (
                                <span className="w-2 shrink-0" aria-hidden />
                              )}
                              <span className="min-w-0">{r.title}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        className="shrink-0 border-t border-[var(--everde-border)] px-2 py-1.5 text-[9px] leading-tight text-zinc-500"
        title="\\192.168.190.10\\Claude Sandbox\\DataDrops"
      >
        <span className="font-medium text-zinc-400">Source: </span>
        <span className="font-mono text-zinc-500">
          \\192.168.190.10\Claude Sandbox\DataDrops
        </span>
      </div>
    </aside>
  );
}
