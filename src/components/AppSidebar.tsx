"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { PORTAL_SECTIONS } from "@/config/portal";

function pathForReport(sectionId: string, reportSlug: string) {
  return `/${sectionId}/${reportSlug}`;
}

export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PORTAL_SECTIONS.map((s) => [s.id, true])),
  );

  const active = useMemo(() => {
    if (!pathname) return null;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return { section: parts[0], report: parts[1] };
    return null;
  }, [pathname]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--everde-border)] bg-[var(--everde-sidebar)] text-[var(--everde-sidebar-fg)]">
      <div className="border-b border-[var(--everde-border)] px-4 py-4">
        <Link href="/" className="block">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--everde-gold)]">
            Everde
          </p>
          <p className="text-lg font-semibold leading-tight text-white">
            AI Operations
          </p>
        </Link>
        <p className="mt-2 text-xs leading-snug text-zinc-400">
          Executive dashboards migrated from Excel prototypes.
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
        <ol className="space-y-1">
          {PORTAL_SECTIONS.map((section, idx) => {
            const expanded = open[section.id] ?? true;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-zinc-200 hover:bg-white/5"
                  onClick={() =>
                    setOpen((o) => ({ ...o, [section.id]: !expanded }))
                  }
                  aria-expanded={expanded}
                >
                  <span className="text-[var(--everde-gold)] tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 font-medium">{section.title}</span>
                  <span className="text-xs text-zinc-500">
                    {expanded ? "−" : "+"}
                  </span>
                </button>
                {expanded && (
                  <ul className="ml-2 border-l border-white/10 pl-2">
                    {section.reports.map((r) => {
                      const href = pathForReport(section.id, r.slug);
                      const isActive =
                        active?.section === section.id &&
                        active?.report === r.slug;
                      return (
                        <li key={r.slug}>
                          <Link
                            href={href}
                            className={
                              isActive
                                ? "block rounded-md bg-[var(--everde-gold)]/15 px-2 py-1.5 text-white ring-1 ring-[var(--everde-gold)]/40"
                                : "block rounded-md px-2 py-1.5 text-zinc-300 hover:bg-white/5 hover:text-white"
                            }
                          >
                            {r.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="border-t border-[var(--everde-border)] px-3 py-3 text-[10px] leading-snug text-zinc-500">
        Source files:{" "}
        <span className="break-all font-mono text-zinc-400">
          \\192.168.190.10\Claude Sandbox\JS Files
        </span>
      </div>
    </aside>
  );
}
