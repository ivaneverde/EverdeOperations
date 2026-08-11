"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SiteFocusData,
  SiteFocusFarm,
  SiteFocusTone,
} from "@/lib/nursery/siteFocus";

const TONE_STYLES: Record<
  SiteFocusTone,
  { label: string; pill: string; bar: string }
> = {
  alert: {
    label: "Needs action",
    pill: "bg-rose-100 text-rose-800 ring-rose-200",
    bar: "bg-rose-500",
  },
  watch: {
    label: "Watch",
    pill: "bg-amber-100 text-amber-900 ring-amber-200",
    bar: "bg-amber-500",
  },
  ok: {
    label: "On track",
    pill: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    bar: "bg-emerald-600",
  },
};

function farmTone(farm: SiteFocusFarm): SiteFocusTone {
  if (farm.items.some((i) => i.tone === "alert")) return "alert";
  if (farm.items.some((i) => i.tone === "watch")) return "watch";
  return "ok";
}

export function SiteFocusSummary() {
  const [data, setData] = useState<SiteFocusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/nursery/site-focus", {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            hint?: string;
            error?: string;
          } | null;
          throw new Error(body?.hint || body?.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as SiteFocusData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load Site Focus");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const regions = data?.regions ?? [];
  const visible = useMemo(() => {
    if (region === "all") return regions;
    return regions.filter((r) => r.name === region);
  }, [region, regions]);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <p className="text-sm text-zinc-500">Loading Site Focus Summary…</p>
    );
  }

  const weekLabel =
    data.meta.week != null ? `Week ${data.meta.week}` : "Weekly";
  const dateLabel = data.meta.reportDate ?? "";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--everde-forest)]">
            {weekLabel}
            {dateLabel ? ` · ${dateLabel}` : ""}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {data.meta.intro}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-zinc-200">
            {data.meta.farmCount} farms
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-rose-200">
            {data.meta.alertCount} alerts
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRegion("all")}
          className={
            region === "all"
              ? "rounded-full bg-[var(--everde-forest)] px-3 py-1 text-xs font-medium text-white"
              : "rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          }
        >
          All regions
        </button>
        {regions.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => setRegion(r.name)}
            className={
              region === r.name
                ? "rounded-full bg-[var(--everde-forest)] px-3 py-1 text-xs font-medium text-white"
                : "rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }
          >
            {r.name}
          </button>
        ))}
      </div>

      {visible.map((r) => (
        <section key={r.name} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {r.name}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {r.farms.map((farm) => {
              const tone = farmTone(farm);
              const styles = TONE_STYLES[tone];
              return (
                <article
                  key={`${r.name}-${farm.code}`}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
                >
                  <div className={`h-1 w-full ${styles.bar}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-900">
                          {farm.code}
                        </h3>
                        <p className="text-xs text-zinc-500">{farm.market}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles.pill}`}
                      >
                        {styles.label}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {farm.items.map((item) => (
                        <li key={`${farm.code}-${item.topic}`}>
                          <p className="text-xs font-semibold text-zinc-800">
                            {item.topic}
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${TONE_STYLES[item.tone].pill}`}
                            >
                              {TONE_STYLES[item.tone].label}
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-zinc-600">
                            {item.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {data.closing ? (
        <p className="text-sm italic text-zinc-500">{data.closing}</p>
      ) : null}
    </div>
  );
}
