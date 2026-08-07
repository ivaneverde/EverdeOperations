"use client";

import { useMemo, useState } from "react";
import type { WcroRepOrder } from "@/lib/wcro/types";

function fmtDollar(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function WCRORepOrders({ reps }: { reps: WcroRepOrder[] }) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("All");
  const [region, setRegion] = useState("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reps.filter((r) => {
      const chans = r.channels?.length
        ? r.channels
        : r.channel
          ? [r.channel]
          : [];
      const regs = r.regions?.length ? r.regions : r.region ? [r.region] : [];
      if (channel !== "All" && !chans.includes(channel)) return false;
      if (region !== "All" && !regs.includes(region)) return false;
      if (!q) return true;
      return (
        r.rep_name.toLowerCase().includes(q) ||
        r.filename.toLowerCase().includes(q)
      );
    });
  }, [reps, search, channel, region]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600">
          Search rep
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or filename…"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-[var(--everde-forest)] focus:ring-1 focus:ring-[var(--everde-forest)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option>All</option>
            <option>HD</option>
            <option>LOW</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Region
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option>All</option>
            <option>N.CA</option>
            <option>S.CA</option>
          </select>
        </label>
        <p className="pb-2 text-xs text-zinc-500">
          {filtered.length} of {reps.length} files
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Rep</th>
              <th className="px-3 py-2 font-semibold">Channel</th>
              <th className="px-3 py-2 font-semibold">Region</th>
              <th className="px-3 py-2 font-semibold text-right">Stores</th>
              <th className="px-3 py-2 font-semibold text-right">Order $</th>
              <th className="px-3 py-2 font-semibold text-right">FOR $</th>
              <th className="px-3 py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.filename}
                className="border-t border-zinc-100 hover:bg-zinc-50/80"
              >
                <td className="px-3 py-2 font-medium text-zinc-900">
                  {r.rep_name}
                  {r.note ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-amber-800">
                      {r.note}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-zinc-700">
                  {(r.channels ?? (r.channel ? [r.channel] : [])).join(", ") ||
                    "—"}
                </td>
                <td className="px-3 py-2 text-zinc-700">
                  {(r.regions ?? (r.region ? [r.region] : [])).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                  {r.store_count}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                  {fmtDollar(r.total_ship)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                  {fmtDollar(r.total_for ?? 0)}
                </td>
                <td className="max-w-[14rem] truncate px-3 py-2">
                  <code
                    className="text-[11px] text-zinc-600"
                    title={r.unc_path}
                  >
                    {r.filename}
                  </code>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  No reps match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
