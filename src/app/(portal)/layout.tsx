import Link from "next/link";
import { AppSidebar } from "@/components/AppSidebar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh min-h-0">
      <AppSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-end border-b border-zinc-200 bg-[var(--everde-canvas)] px-3 py-1.5">
          <Link
            href="/admin"
            className="text-xs font-semibold uppercase tracking-wide text-[var(--everde-forest)] hover:underline"
          >
            Admin
          </Link>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
