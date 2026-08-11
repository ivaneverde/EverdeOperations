export function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}…[truncated]`;
}

function slimArray(val: unknown, max: number): unknown {
  return Array.isArray(val) ? val.slice(0, max) : val;
}

function slimTopCarriers(val: unknown, years = 2, perYear = 12): unknown {
  if (!val || typeof val !== "object") return val;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(val as Record<string, unknown>).sort(
    (a, b) => Number(b) - Number(a),
  );
  for (const y of keys.slice(0, years)) {
    out[y] = slimArray((val as Record<string, unknown>)[y], perYear);
  }
  return out;
}

function pickKeys(
  parsed: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in parsed) out[k] = parsed[k];
  }
  return out;
}

export function compactFreightJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, [
      "meta",
      "company_kpis",
      "tp_by_year",
      "tp_region",
      "region_kpis",
    ]);
    payload.top_carriers = slimTopCarriers(p.top_carriers, 2, 12);
    payload.top_lanes = slimTopCarriers(p.top_lanes, 1, 8);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

export function compactSalesPlanJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, [
      "meta",
      "totals_ye",
      "miss_summary",
      "channel_summary",
      "ytd_performance",
      "lift_summary",
    ]);
    payload.top_ki_miss = slimArray(p.top_ki_miss, 15);
    payload.excess_by_ki = slimArray(p.excess_by_ki, 15);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

export function compactRetailJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, ["meta", "headline", "key_numbers", "region_crosstab"]);
    payload.action_buckets = p.key_numbers
      ? (p.key_numbers as Record<string, unknown>).action_buckets
      : undefined;
    const stores =
      Array.isArray(p.all_stores) && p.all_stores.length > 0
        ? p.all_stores
        : p.top20_stores;
    payload.all_stores = stores;
    if (payload.meta && typeof payload.meta === "object") {
      (payload.meta as Record<string, unknown>).all_stores_count =
        (p.meta as { all_stores_count?: number } | undefined)?.all_stores_count ??
        (Array.isArray(stores) ? stores.length : 0);
    }
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

export function compactWeatherJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, ["meta", "headline", "regions", "alerts", "summary"]);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

export function compactNurseryJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, [
      "meta",
      "headline",
      "summary",
      "farms",
      "demand",
      "farmBO",
      "farmYTD",
      "variance",
      "cycle",
      "photos",
      "readyDate",
      "weeklyTotals",
      "regionWeekly",
      "topReasons",
      "topCrReasons",
    ]);
    payload.farms = slimArray(p.farms, 20);
    payload.farmBO = slimArray(p.farmBO, 20);
    payload.farmYTD = slimArray(p.farmYTD, 20);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

/** Compact nursery supply (XXTT inventory) — never dump full SKU lines in snapshot. */
export function compactNurserySupplyJson(
  raw: string,
  maxChars: number,
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = pickKeys(p, ["meta", "headline", "summary", "grades"]);
    payload.lines = slimArray(p.lines, 30);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

/** Compact WCRO extract for bot snapshot / tool (Four Numbers + segments + top pools). */
export function compactWcroJson(
  raw: string,
  maxChars: number,
  channel?: "HD" | "LOW" | "ALL",
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const snap = (p.snapshot as Record<string, unknown>) ?? {};
    const four = (p.four_numbers as Record<string, unknown>) ?? {};
    const segments =
      (
        (p.exec_summary as { combined_summary?: { segments?: unknown[] } })
          ?.combined_summary?.segments ?? []
      ).filter((s) => {
        if (!channel || channel === "ALL") return true;
        const seg = String((s as { segment?: string }).segment ?? "");
        if (channel === "HD") {
          return seg.startsWith("HD") || seg.startsWith("Combined");
        }
        return (
          seg.toLowerCase().startsWith("lowes") ||
          seg.startsWith("Combined")
        );
      });

    const reps = Array.isArray(p.rep_orders) ? p.rep_orders : [];
    const filteredReps = reps
      .filter((r) => {
        if (!channel || channel === "ALL") return true;
        const chans = (r as { channels?: string[]; channel?: string }).channels
          ?.length
          ? (r as { channels: string[] }).channels
          : [(r as { channel?: string }).channel].filter(Boolean);
        return chans.includes(channel === "LOW" ? "LOW" : "HD");
      })
      .slice(0, 15)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          rep_name: row.rep_name,
          channels: row.channels ?? row.channel,
          regions: row.regions ?? row.region,
          store_count: row.store_count,
          total_ship: row.total_ship,
          total_for: row.total_for,
          filename: row.filename,
        };
      });

    const transfers = Array.isArray(p.transfers) ? p.transfers : [];
    const xfer = transfers
      .filter((t) => {
        if (!channel || channel === "ALL") return true;
        return (t as { channel?: string }).channel === channel;
      })
      .map((t) => {
        const row = t as Record<string, unknown>;
        return {
          channel: row.channel,
          total_transfer_u: row.total_transfer_u,
          total_transfer_$: row.total_transfer_$,
        };
      });

    // Top genus/form/size pools by NN Cust Store $ — answers "top pools for a spread"
    const storeRec = Array.isArray(p.store_recommendation)
      ? p.store_recommendation
      : [];
    const topPoolsByMarket: Array<{
      channel: string;
      market: string;
      pool_count: number;
      totals: unknown;
      top_pools: unknown[];
    }> = [];
    for (const rec of storeRec) {
      const row = rec as {
        channel?: string;
        markets?: Record<
          string,
          {
            pool_count?: number;
            totals?: unknown;
            top_pools_by_nn_cust_store?: unknown[];
          }
        >;
      };
      const ch = String(row.channel ?? "");
      if (channel === "HD" && ch !== "HD") continue;
      if (channel === "LOW" && ch !== "LOW") continue;
      const markets = row.markets ?? {};
      for (const [market, m] of Object.entries(markets)) {
        const pools = Array.isArray(m.top_pools_by_nn_cust_store)
          ? m.top_pools_by_nn_cust_store.slice(0, 15)
          : [];
        topPoolsByMarket.push({
          channel: ch,
          market,
          pool_count: Number(m.pool_count ?? 0),
          totals: m.totals ?? null,
          top_pools: pools,
        });
      }
    }

    const payload = {
      snapshot: snap,
      four_numbers: four,
      segments,
      top_pools_by_market: topPoolsByMarket,
      transfers: xfer,
      rep_orders_sample: filteredReps,
      rep_orders_count: reps.length,
      glossary: {
        NN: "Net Need — units/dollars still needed after current inventory and on-order.",
        NN_Plan: "Plan-driven net need (sales plan catch-up).",
        NN_Cust_Store:
          "Demand-sensed net need computed store-by-store then summed (gross). Often larger than NN Pool.",
        NN_Cust_Pool:
          "Same demand-sensed math at pool grain — nets surplus stores against short stores. Four Numbers NN Cust Store tile uses this pool figure.",
        maldistribution:
          "Gap between NN Cust Store (gross) and NN Cust Pool ≈ stock at the wrong stores.",
        pool:
          "WCRO pool = genus + form + size assortment. retailer_pool_sku = retailer SKU for that pool; everde_item_codes / top_items = member Everde items under the pool.",
      },
      rules: [
        "Lead with published WCRO figures you have (segments, top_pools_by_market, transfers, reps). Do not say pool data is missing when top_pools_by_market is present.",
        "For 'top pools': use genus/form/size + nn_cust_store_gross_$ + ship_$.",
        "When the user asks for SKUs / items / what to put on a spread: prefer retailer_pool_sku + top_items (item + item_description) and everde_item_codes from top_pools — do not stop at genus alone.",
        "Clarify: retailer_pool_sku = HD/Lowes pool SKU; Item codes like BOUBAF0405 = Everde item IDs; item_description = variety name.",
        "Ship This Week = in-region + FOR-direct; To Transfer = next-week shelf (not this week's order).",
        "NN Plan ≠ NN Cust Store ≠ NN Cust Pool — explain briefly if the user asks.",
        "YTD store sales + farm supply may support a secondary cross-check; label that as hypothesis, not the official WCRO order.",
        "Never invent store×SKU Write Order lines that are not in this extract.",
        "Plan variance = Plan − Actual; positive = behind plan.",
        "LOW S.CA is not comparable to HD S.CA (LOW includes AZ/NV/NM/UT).",
        "HD on-hand is sales-gated (~12% fill) — caveat HD ship recs.",
        "Stay helpful: answer with the best grain available, cite snapshot date once, offer one clear next step — do not open with capability denials.",
      ],
    };
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

/** Weekly Inventory Metrics Site Focus Summary (already compact narrative JSON). */
export function compactSiteFocusJson(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return truncateText(JSON.stringify(p), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

/** Compact HD / Lowe's Following Week YTD meta (never full row grids). */
export function compactYtdFollowingWeekMeta(
  raw: string,
  maxChars: number,
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const columns = Array.isArray(p.columns)
      ? (p.columns as string[])
      : [];
    const totals = Array.isArray(p.totals) ? (p.totals as unknown[]) : [];
    const totalsByCol: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const t = totals[i];
      if (t != null && t !== "") totalsByCol[columns[i]] = t;
    }
    const payload = {
      sourceFile: p.sourceFile,
      asOf: p.asOf,
      retailer: p.retailer ?? null,
      rowCount: p.rowCount,
      columnCount: p.columnCount,
      freezeColumns: p.freezeColumns,
      columns: columns.slice(0, 40),
      totals_by_column: totalsByCol,
      note: "Full store-SKU grids are huge — use get_hd_ytd_following_week / get_lowes_ytd_following_week with focus=query and q= for filtered samples.",
    };
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}
