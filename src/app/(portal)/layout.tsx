import Link from "next/link";
import { AppSidebar } from "@/components/AppSidebar";
import { PortalAssistant } from "@/components/assistant/PortalAssistant";
import { PortalSignOut } from "@/components/PortalSignOut";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="portal-shell flex min-h-0">
      <AppSidebar />
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-[var(--everde-canvas)] px-3 py-2">
          <div className="flex min-w-0 flex-1 justify-center px-2">
            <PortalAssistant />
          </div>
          <div className="flex shrink-0 items-center gap-4">
          <PortalSignOut />
          <Link
            href="/admin"
            className="text-xs font-semibold uppercase tracking-wide text-[var(--everde-forest)] hover:underline"
          >
            Admin
          </Link>
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
