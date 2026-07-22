"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type HdYtdMeta = {
  sourceFile: string;
  asOf: string;
  columns: string[];
  formats: string[];
  freezeColumns: number;
  totals: (string | number | null)[];
  rowCount: number;
  columnCount: number;
};

type Cell = string | number | boolean | null;

const ROW_H = 28;
const COL_W_DEFAULT = 110;
const COL_W_NAME = 220;
const COL_W_KEY = 130;

function colWidth(name: string, index: number): number {
  const n = name.toLowerCase();
  if (index === 0 || n === "key") return COL_W_KEY;
  if (n.includes("name") || n.includes("desc")) return COL_W_NAME;
  if (n.includes("sku nbr") || n.includes("store nbr") || n.includes("market"))
    return 88;
  return COL_W_DEFAULT;
}

function formatCell(value: Cell, fmt: string): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value !== "number" || Number.isNaN(value)) return String(value);
  if (fmt === "currency") {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }
  if (fmt === "integer") {
    return Math.round(value).toLocaleString("en-US");
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Portal-themed Excel-like virtualized grid for HD Sales YTD Following Week Sales.
 */
export function HdYtdGridEmbed() {
  const [meta, setMeta] = useState<HdYtdMeta | null>(null);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const fetchGen = useRef(0);

  const colWidths = useMemo(() => {
    if (!meta) return [] as number[];
    return meta.columns.map((c, i) => colWidth(c, i));
  }, [meta]);

  const freeze = meta?.freezeColumns ?? 7;
  const stickyLeft = useMemo(() => {
    const lefts: number[] = [];
    let x = 0;
    for (let i = 0; i < (meta?.columns.length ?? 0); i++) {
      lefts.push(x);
      x += colWidths[i] ?? COL_W_DEFAULT;
    }
    return lefts;
  }, [meta, colWidths]);

  const totalWidth = useMemo(
    () => colWidths.reduce((a, b) => a + b, 0),
    [colWidths],
  );

  const loadWindow = useCallback(
    async (start: number, limit: number, query: string, append: boolean) => {
      const gen = ++fetchGen.current;
      const params = new URLSearchParams({
        start: String(start),
        limit: String(limit),
      });
      if (query) params.set("q", query);
      const res = await fetch(`/api/hd-ytd/rows?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Rows HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        rows: Cell[][];
        total: number;
      };
      if (gen !== fetchGen.current) return;
      setTotal(data.total);
      setRows((prev) => {
        if (!append) {
          const next = new Array(data.total);
          for (let i = 0; i < data.rows.length; i++) {
            next[start + i] = data.rows[i];
          }
          return next;
        }
        const next =
          prev.length === data.total ? prev.slice() : new Array(data.total);
        if (prev.length === data.total) {
          for (let i = 0; i < prev.length; i++) next[i] = prev[i];
        } else {
          for (let i = 0; i < Math.min(prev.length, data.total); i++) {
            next[i] = prev[i];
          }
        }
        for (let i = 0; i < data.rows.length; i++) {
          next[start + i] = data.rows[i];
        }
        return next;
      });
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mRes = await fetch("/api/hd-ytd/meta");
      if (!mRes.ok) {
        const body = (await mRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Meta HTTP ${mRes.status}`);
      }
      const m = (await mRes.json()) as HdYtdMeta;
      setMeta(m);
      setRows([]);
      await loadWindow(0, 400, qApplied, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadWindow, qApplied]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const rowVirtualizer = useVirtualizer({
    count: total || rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  // Prefetch windows as user scrolls
  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (!items.length || !meta) return;
    const first = items[0].index;
    const last = items[items.length - 1].index;
    const missing: number[] = [];
    for (let i = first; i <= last; i++) {
      if (rows[i] == null) missing.push(i);
    }
    if (!missing.length) return;
    const start = Math.max(0, missing[0] - 50);
    const end = missing[missing.length - 1] + 50;
    const limit = Math.min(2000, end - start + 1);
    const t = window.setTimeout(() => {
      void loadWindow(start, limit, qApplied, true).catch(() => undefined);
    }, 40);
    return () => window.clearTimeout(t);
  }, [rowVirtualizer.getVirtualItems(), rows, meta, loadWindow, qApplied]);

  const applyFilter = () => {
    setQApplied(q.trim());
  };

  const reload = () => {
    setQApplied(q.trim());
    void bootstrap();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (loading && !meta) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading HD Sales YTD grid…
      </div>
    );
  }

  if (!meta) return null;

  const headerH = ROW_H;
  const totalsH = meta.totals?.some((t) => t != null && t !== "") ? ROW_H : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Reload view
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter();
          }}
          placeholder="Filter Market / Store / SKU…"
          className="min-w-[220px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={applyFilter}
          className="rounded-md bg-[#2F5233] px-3 py-2 text-sm font-medium text-white hover:bg-[#254228]"
        >
          Apply
        </button>
        <span className="text-xs text-zinc-500">
          {total.toLocaleString()} rows
          {qApplied ? ` (filtered)` : ""} · as of {meta.asOf} ·{" "}
          {meta.sourceFile}
        </span>
      </div>

      <div
        ref={parentRef}
        className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-[#1a2e1c] bg-[#0f1a11] shadow-sm"
      >
        <div
          style={{
            width: totalWidth,
            height: rowVirtualizer.getTotalSize() + headerH + totalsH,
            position: "relative",
          }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-30 flex border-b border-[#C49B3F]/40"
            style={{ height: headerH, width: totalWidth }}
          >
            {meta.columns.map((col, i) => {
              const sticky = i < freeze;
              return (
                <div
                  key={`h-${i}`}
                  className="flex shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#2a4030] px-2 text-[11px] font-semibold tracking-wide text-[#F5E6C8]"
                  style={{
                    width: colWidths[i],
                    background: "#1F3A28",
                    position: sticky ? "sticky" : undefined,
                    left: sticky ? stickyLeft[i] : undefined,
                    zIndex: sticky ? 40 : 30,
                    boxShadow: sticky && i === freeze - 1 ? "2px 0 4px rgba(0,0,0,.25)" : undefined,
                  }}
                  title={col}
                >
                  {col}
                </div>
              );
            })}
          </div>

          {/* Totals */}
          {totalsH > 0 && (
            <div
              className="sticky z-20 flex border-b border-[#C49B3F]/30"
              style={{ top: headerH, height: totalsH, width: totalWidth }}
            >
              {meta.totals.map((val, i) => {
                const sticky = i < freeze;
                const fmt = meta.formats[i] || "text";
                const align =
                  fmt === "currency" || fmt === "integer" || fmt === "number"
                    ? "right"
                    : "left";
                return (
                  <div
                    key={`t-${i}`}
                    className="flex shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#2a4030] px-2 text-[11px] font-semibold text-[#C49B3F]"
                    style={{
                      width: colWidths[i],
                      background: "#162418",
                      justifyContent: align === "right" ? "flex-end" : "flex-start",
                      position: sticky ? "sticky" : undefined,
                      left: sticky ? stickyLeft[i] : undefined,
                      zIndex: sticky ? 25 : 20,
                    }}
                  >
                    {formatCell(val as Cell, fmt)}
                  </div>
                );
              })}
            </div>
          )}

          {/* Body */}
          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index];
            const top = vRow.start + headerH + totalsH;
            const zebra = vRow.index % 2 === 1;
            return (
              <div
                key={vRow.key}
                className="absolute left-0 flex"
                style={{
                  top,
                  height: ROW_H,
                  width: totalWidth,
                }}
              >
                {meta.columns.map((_, i) => {
                  const sticky = i < freeze;
                  const fmt = meta.formats[i] || "text";
                  const align =
                    fmt === "currency" || fmt === "integer" || fmt === "number"
                      ? "right"
                      : "left";
                  const bg = sticky
                    ? zebra
                      ? "#152018"
                      : "#101a12"
                    : zebra
                      ? "#121c14"
                      : "#0f1a11";
                  return (
                    <div
                      key={`c-${vRow.index}-${i}`}
                      className="flex shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#1e2e22] px-2 text-[11px] text-[#E8EDE9]"
                      style={{
                        width: colWidths[i],
                        background: bg,
                        justifyContent:
                          align === "right" ? "flex-end" : "flex-start",
                        position: sticky ? "sticky" : undefined,
                        left: sticky ? stickyLeft[i] : undefined,
                        zIndex: sticky ? 10 : 1,
                        boxShadow:
                          sticky && i === freeze - 1
                            ? "2px 0 4px rgba(0,0,0,.2)"
                            : undefined,
                      }}
                      title={row ? String(row[i] ?? "") : ""}
                    >
                      {row ? formatCell(row[i], fmt) : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
