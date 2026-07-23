"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { PortalAssistant } from "@/components/assistant/PortalAssistant";
import { PortalSignOut } from "@/components/PortalSignOut";

export function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Close mobile nav on navigation
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Escape closes mobile nav
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // Lock body scroll when drawer open (iOS)
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="portal-shell flex min-h-0">
      {/* Desktop sidebar */}
      <div className="hidden h-full shrink-0 md:flex">
        <AppSidebar />
      </div>

      {/* Mobile nav drawer */}
      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex h-dvh max-h-dvh w-[min(17.5rem,88vw)] shadow-xl">
            <AppSidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 bg-[var(--everde-canvas)] px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 sm:contents">
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-800 md:hidden"
              aria-label="Open navigation menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <span className="flex flex-col gap-1" aria-hidden>
                <span className="block h-0.5 w-4 rounded bg-zinc-700" />
                <span className="block h-0.5 w-4 rounded bg-zinc-700" />
                <span className="block h-0.5 w-4 rounded bg-zinc-700" />
              </span>
            </button>

            <Link
              href="/"
              className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--everde-forest)] md:hidden"
            >
              Everde AI Operations
            </Link>

            <div className="flex shrink-0 items-center gap-3 md:order-last">
              <PortalSignOut />
              <Link
                href="/admin"
                className="text-xs font-semibold uppercase tracking-wide text-[var(--everde-forest)] hover:underline"
              >
                Admin
              </Link>
            </div>
          </div>

          <div className="flex min-w-0 w-full flex-1 justify-center sm:px-2">
            <PortalAssistant />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
