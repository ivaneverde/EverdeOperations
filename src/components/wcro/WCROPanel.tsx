"use client";

import { useEffect, useState } from "react";
import { WCROBuildHealth } from "@/components/wcro/WCROBuildHealth";
import { WCROHeader } from "@/components/wcro/WCROHeader";
import { WCRORepOrders } from "@/components/wcro/WCRORepOrders";
import type { WcroData, WcroViewId } from "@/lib/wcro/types";

function fmtDollar(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function StoreRecView({ data }: { data: WcroData }) {
  const segments = data.exec_summary?.combined_summary?.segments ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Combined Summary segments (wholesale $). A+B on hand is shared stock —
        do not sum HD + LOW.
      </p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2 text-right">Ship $</th>
              <th className="px-3 py-2 text-right">Transfer $</th>
              <th className="px-3 py-2 text-right">NN Plan u</th>
              <th className="px-3 py-2 text-right">NN Cust Pool u</th>
              <th className="px-3 py-2 text-right">NN Cust Gross u</th>
              <th className="px-3 py-2 text-right">Plan Var net $</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => {
              const seg = String(s.segment ?? "");
              return (
                <tr key={seg} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium text-zinc-900">{seg}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtDollar(s.ship_this_week_$ as number)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtDollar(s.to_transfer_$ as number)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtNum(s.nn_plan_u as number)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtNum(s.nn_cust_pool_u as number)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtNum(s.nn_cust_store_u as number)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtDollar(s.plan_var_net_$ as number)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(data.store_recommendation ?? []).map((ch) => (
        <div key={ch.channel} className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">
            {ch.channel} — top pools by NN Cust Store $
          </h3>
          {Object.entries(ch.markets ?? {}).map(([region, mkt]) => (
            <div
              key={`${ch.channel}-${region}`}
              className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {region} · {mkt.pool_count} pools
                </p>
                <p className="text-xs tabular-nums text-zinc-600">
                  Ship {fmtDollar(mkt.totals.ship_$)} · Transfer{" "}
                  {fmtDollar(mkt.totals.to_transfer_$)}
                </p>
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Genus</th>
                    <th className="px-3 py-2">Form</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2 text-right">NN Cust $</th>
                    <th className="px-3 py-2 text-right">Ship $</th>
                  </tr>
                </thead>
                <tbody>
                  {(mkt.top_pools_by_nn_cust_store ?? [])
                    .slice(0, 15)
                    .map((p, i) => (
                      <tr
                        key={`${region}-${i}`}
                        className="border-t border-zinc-100"
                      >
                        <td className="px-3 py-1.5">{String(p.genus ?? "—")}</td>
                        <td className="px-3 py-1.5 text-zinc-600">
                          {String(p.form ?? "—")}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-600">
                          {String(p.size ?? "—")}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtDollar(p.nn_cust_store_gross_$ as number)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtDollar(p.ship_$ as number)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}

      <p className="text-[11px] text-amber-900">
        Note: HD on-hand feed is sales-gated (~12% fill); HD ship recs may be
        overstated for specialty / newly received items. LOW data is fully
        populated.
      </p>
    </div>
  );
}

function OnhandView({ data }: { data: WcroData }) {
  const [edition, setEdition] = useState<"weekly" | "ytd">("weekly");
  const bucket = data.on_hand_register?.[edition] ?? {};
  const keys = Object.keys(bucket).sort();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["weekly", "ytd"] as const).map((ed) => (
          <button
            key={ed}
            type="button"
            onClick={() => setEdition(ed)}
            className={
              edition === ed
                ? "rounded-md bg-[var(--everde-forest)] px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
            }
          >
            {ed === "weekly" ? "Weekly" : "YTD"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {keys.map((key) => {
          const m = bucket[key];
          const nn = m.net_need_block ?? {};
          return (
            <div
              key={key}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-zinc-900">
                {m.channel} {m.region} · {m.edition}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{m.file}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">NN Cust Store $</dt>
                  <dd className="tabular-nums font-medium">
                    {fmtDollar(nn.nn_cust_store_$ as number)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Shippable A+B $</dt>
                  <dd className="tabular-nums">
                    {fmtDollar(nn.shippable_ab_$ as number)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Uncovered $</dt>
                  <dd className="tabular-nums">
                    {fmtDollar(nn.uncovered_$ as number)}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransfersView({ data }: { data: WcroData }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Cross-region ops moves — material ships in-region next cycle.
      </p>
      {(data.transfers ?? []).map((t) => (
        <div
          key={t.channel}
          className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              {t.channel} Transfers
            </h3>
            <p className="text-sm tabular-nums text-zinc-800">
              {fmtNum(t.total_transfer_u)} u · {fmtDollar(t.total_transfer_$)}
            </p>
          </div>
          {Object.entries(t.tabs ?? {}).map(([name, tab]) => (
            <div key={name} className="space-y-2">
              <div className="rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
                <p className="font-medium text-zinc-800">{name}</p>
                <p className="text-xs text-zinc-600">
                  {tab.line_count} lines · {fmtNum(tab.transfer_qty_u)} u ·{" "}
                  {fmtDollar(tab.wholesale_$)}
                </p>
              </div>
              {(tab.lines?.length ?? 0) > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="px-2 py-1">From</th>
                        <th className="px-2 py-1">Genus</th>
                        <th className="px-2 py-1">Size</th>
                        <th className="px-2 py-1 text-right">Qty u</th>
                        <th className="px-2 py-1 text-right">$ </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tab.lines ?? [])
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(b.wholesale_$ ?? 0) -
                            Number(a.wholesale_$ ?? 0),
                        )
                        .slice(0, 20)
                        .map((line, i) => (
                          <tr key={i} className="border-t border-zinc-100">
                            <td className="px-2 py-1">
                              {String(line.from ?? "—")}
                            </td>
                            <td className="px-2 py-1">
                              {String(line.genus ?? "—")}
                            </td>
                            <td className="px-2 py-1">
                              {String(line.size ?? "—")}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {fmtNum(line.transfer_qty_u as number)}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {fmtDollar(line.wholesale_$ as number)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ExecStubView({ data }: { data: WcroData }) {
  const sms = data.exec_summary?.sales_manager_summary;
  const files = data.exec_summary?.set1_files ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {data.exec_summary?.stub_note ??
          "Set 1 is being phased toward retirement. Prefer Store Recommendation."}
      </div>
      {sms && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">
            Sales Manager Summary (headline)
          </h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Plan var NET $ (wholesale)</dt>
              <dd className="tabular-nums font-medium">
                {fmtDollar(sms.plan_var_net_$ as number)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">NN Plan u</dt>
              <dd className="tabular-nums">
                {fmtNum(
                  (sms.headline as { nn_plan_u?: number } | undefined)
                    ?.nn_plan_u,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">NN Customer u (SMS)</dt>
              <dd className="tabular-nums">
                {fmtNum(
                  (sms.nn_customer as { units?: number } | undefined)?.units,
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-zinc-500">
            Cite source when quoting plan variance — SMS NET may differ from
            Combined Summary.
          </p>
        </div>
      )}
      <ul className="space-y-1 text-xs text-zinc-600">
        {files.map((f) => (
          <li key={String(f.file)}>
            <span className="font-medium text-zinc-800">
              {String(f.role ?? "file")}:
            </span>{" "}
            {String(f.file)}
            {f.note ? ` — ${String(f.note)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WCROPanel({ view }: { view: WcroViewId }) {
  const [data, setData] = useState<WcroData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/wcro/data", { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as WcroData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load WCRO data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-sm text-zinc-600">Loading WCRO extract…</div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {error ?? "WCRO data not available — run extract_wcro.py first."}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <WCROHeader
        four={data.four_numbers}
        refresh={data.snapshot.refresh}
        date={data.snapshot.date}
      />
      {view === "store-rec" && <StoreRecView data={data} />}
      {view === "onhand" && <OnhandView data={data} />}
      {view === "transfers" && <TransfersView data={data} />}
      {view === "rep-orders" && <WCRORepOrders reps={data.rep_orders} />}
      {view === "build" && <WCROBuildHealth data={data} />}
      {view === "exec" && <ExecStubView data={data} />}
    </div>
  );
}
