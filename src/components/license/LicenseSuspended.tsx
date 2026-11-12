import type { PreeminentLicenseStatus } from "@/lib/license/preeminentLicense";

export function LicenseSuspended({
  status,
}: {
  status: PreeminentLicenseStatus | null;
}) {
  const period = status?.period ?? "this month";
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center bg-[var(--everde-canvas)] px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Portal temporarily unavailable
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-600">
        Everde AI Operations depends on licensed Preeminent libraries. Monthly
        payment proof for <span className="font-medium text-zinc-800">{period}</span>{" "}
        was not on file at month-end, so the portal and Teams bots are offline
        until a PayPal receipt (or uploaded proof) is recorded.
      </p>
      <p className="mt-4 max-w-lg text-xs text-zinc-500">
        Admins: pay The PreEminent Store LLC, then attach the receipt in Cursor
        chat with the invoice period (e.g. NOV2026) so status can be published.
      </p>
    </div>
  );
}
