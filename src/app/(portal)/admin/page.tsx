import type { Metadata } from "next";
import { AdminFreightTools } from "@/components/admin/AdminFreightTools";

export const metadata: Metadata = {
  title: "Admin | Everde AI Operations",
  description: "Operational tools for freight data drops and Blob publishing.",
};

export default function AdminPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--everde-canvas)]">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Admin
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Freight weekly uploads and dashboard JSON checks. Requires Entra
            sign-in with an @everde.com account (or a configured upload key for
            automation).
          </p>
        </header>
        <AdminFreightTools />
      </div>
    </div>
  );
}
