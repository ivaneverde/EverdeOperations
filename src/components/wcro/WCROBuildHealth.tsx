import type { WcroData } from "@/lib/wcro/types";

function StatusPill({ status }: { status: string }) {
  const ok = status.toUpperCase() === "PASS" || status.toUpperCase() === "PASSED";
  return (
    <span
      className={
        ok
          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900"
          : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900"
      }
    >
      {status}
    </span>
  );
}

export function WCROBuildHealth({ data }: { data: WcroData }) {
  const bh = data.build_health;
  const counts = bh.file_counts ?? {};
  const expected = bh.expected_file_counts ?? {};
  const validation = bh.validation;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Snapshot
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">
            Refresh {bh.refresh ?? data.snapshot.refresh} ·{" "}
            {bh.date ?? data.snapshot.date}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {bh.fiscal_calendar_note ?? "4-5-4; weeks end Saturday"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Extractor validation
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill
              status={validation?.passed ? "PASS" : "FAIL"}
            />
            <span className="text-xs text-zinc-600">Four Numbers + 40 reps</span>
          </div>
          {validation?.errors && validation.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-red-800">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Supply filter
          </p>
          <div className="mt-2">
            <StatusPill status={bh.supply_filter?.result ?? "UNKNOWN"} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {bh.supply_filter?.note ??
              "TX/FL farm orgs must not appear in WCRO output."}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">File counts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Set</th>
                <th className="px-3 py-2 text-right">Found</th>
                <th className="px-3 py-2 text-right">Expected</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys({ ...expected, ...counts }).map((key) => (
                <tr key={key} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-800">{key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {counts[key] ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {expected[key] ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(bh.store_driven ?? []).map((sd) => (
        <section
          key={sd.channel}
          className="rounded-lg border border-zinc-200 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-800">
              Store Driven — {sd.channel}
            </h2>
            <StatusPill status={sd.status} />
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Check</th>
                  <th className="px-3 py-2">Detail</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {sd.checks.map((c) => (
                  <tr key={c.check} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-800">{c.check}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {c.detail}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={c.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {bh.known_flags && bh.known_flags.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <h2 className="text-sm font-semibold">Known open flags</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {bh.known_flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
