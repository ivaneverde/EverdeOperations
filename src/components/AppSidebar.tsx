"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import packageJson from "../../package.json";
import {
  getSectionNumberPrefix,
  isSectionOnly,
  PORTAL_SECTIONS,
  type PortalSection,
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

function sectionHasActiveReport(
  section: PortalSection,
  pathname: string | null,
  activeSectionId: string | null,
  activeReportSlug: string | null,
) {
  if (!pathname || activeSectionId !== section.id) return false;
  return section.reports.some((r) => {
    if (r.hideFromNav) return false;
    const href = hrefForReport(section.id, r.slug, r.navHref);
    return (
      pathname === href ||
      (!r.navHref?.trim() && activeReportSlug === r.slug)
    );
  });
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

  /** true = user collapsed; false = user expanded; undefined = default (collapsed unless active). */
  const [collapsed, setCollapsed] = useState<Record<string, boolean | undefined>>(
    {},
  );

  const isSectionCollapsed = useCallback(
    (section: PortalSection) => {
      if (isSectionOnly(section)) return false;
      if (
        sectionHasActiveReport(
          section,
          pathname,
          activeSectionId,
          activeReportSlug,
        )
      ) {
        return false;
      }
      if (collapsed[section.id] === false) return false;
      if (collapsed[section.id] === true) return true;
      return true;
    },
    [pathname, activeSectionId, activeReportSlug, collapsed],
  );

  const toggleSection = useCallback(
    (sectionId: string) => {
      const section = PORTAL_SECTIONS.find((s) => s.id === sectionId);
      if (!section) return;
      const nowCollapsed = isSectionCollapsed(section);
      setCollapsed((prev) => ({
        ...prev,
        [sectionId]: !nowCollapsed,
      }));
    },
    [isSectionCollapsed],
  );

  return (
    <aside className="flex h-full max-h-full w-60 shrink-0 flex-col overflow-hidden border-r border-[var(--everde-border)] bg-[var(--everde-sidebar)] text-[var(--everde-sidebar-fg)]">
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
      <nav
        className="portal-sidebar-nav min-h-0 flex-1 px-1.5 py-1.5 text-[11px] leading-tight"
        aria-label="Portal sections"
        onWheel={(e) => e.stopPropagation()}
      >
        <ol className="space-y-0.5 pb-2">
          {PORTAL_SECTIONS.map((section) => {
            const only = isSectionOnly(section);
            const sectionHref = `/${section.id}`;
            const sectionActive =
              activeSectionId === section.id &&
              (only ? activeReportSlug === null : false);
            const sectionNum = getSectionNumberPrefix(section);
            const isCollapsed = !only && isSectionCollapsed(section);

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
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-zinc-300 hover:bg-white/5 hover:text-white"
                      aria-expanded={!isCollapsed}
                    >
                      <span
                        className="w-3 shrink-0 text-[10px] text-zinc-500"
                        aria-hidden
                      >
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      {sectionNum ? (
                        <span className="shrink-0 text-[var(--everde-gold)] tabular-nums">
                          {sectionNum}{" "}
                        </span>
                      ) : null}
                      <span className="min-w-0 font-medium text-zinc-100">
                        {section.title}
                      </span>
                    </button>
                    {!isCollapsed ? (
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
                                      style={{
                                        backgroundColor: `#${r.navAccent}`,
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="w-2 shrink-0"
                                      aria-hidden
                                    />
                                  )}
                                  <span className="min-w-0">{r.title}</span>
                                </Link>
                              </li>
                            );
                          })}
                      </ul>
                    ) : null}
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
