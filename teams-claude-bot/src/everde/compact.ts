import { compactWeatherDashboardPayload } from "./weatherFulfillment.js";

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
  return compactWeatherDashboardPayload(raw, maxChars);
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

function normalizeStoreKey(raw: string | undefined | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

/** Compact WCRO extract for bot snapshot / tool (Four Numbers + segments + top pools). */
export function compactWcroJson(
  raw: string,
  maxChars: number,
  channel?: "HD" | "LOW" | "ALL",
  storeFilter?: string | null,
  focus?: string | null,
  accountManager?: string | null,
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const snap = (p.snapshot as Record<string, unknown>) ?? {};
    const four = (p.four_numbers as Record<string, unknown>) ?? {};
    const storeKey = storeFilter ? normalizeStoreKey(storeFilter) : "";
    const focusKey = (focus || "summary").toLowerCase();
    const amFilter = (accountManager || "").trim().toLowerCase();
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
    const byStoreRows: Array<Record<string, unknown>> = [];
    let byStoreTotal = 0;
    const byOverstockRows: Array<Record<string, unknown>> = [];
    let byOverstockTotal = 0;
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
        by_store_net_need?: Array<Record<string, unknown>>;
        by_store_net_need_count?: number;
        by_store_overstock?: Array<Record<string, unknown>>;
        by_store_overstock_count?: number;
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
      const storeRows = Array.isArray(row.by_store_net_need)
        ? row.by_store_net_need
        : [];
      byStoreTotal += Number(row.by_store_net_need_count ?? storeRows.length);
      const overRows = Array.isArray(row.by_store_overstock)
        ? row.by_store_overstock
        : [];
      byOverstockTotal += Number(
        row.by_store_overstock_count ?? overRows.length,
      );
      if (storeKey) {
        for (const sr of storeRows) {
          if (normalizeStoreKey(String(sr.store ?? "")) === storeKey) {
            byStoreRows.push(sr);
          }
        }
        for (const sr of overRows) {
          if (normalizeStoreKey(String(sr.store ?? "")) === storeKey) {
            byOverstockRows.push(sr);
          }
        }
      }
    }

    byStoreRows.sort(
      (a, b) => Number(b.gross_need_u ?? 0) - Number(a.gross_need_u ?? 0),
    );
    byOverstockRows.sort(
      (a, b) => Number(b["excess_$"] ?? 0) - Number(a["excess_$"] ?? 0),
    );

    const payload: Record<string, unknown> = {
      snapshot: snap,
      four_numbers: four,
      segments,
      top_pools_by_market: topPoolsByMarket,
      transfers: xfer,
      rep_orders_sample: filteredReps,
      rep_orders_count: reps.length,
      by_store_net_need_available: byStoreTotal > 0,
      by_store_net_need_row_count: byStoreTotal,
      by_store_overstock_available: byOverstockTotal > 0,
      by_store_overstock_row_count: byOverstockTotal,
      glossary: {
        NN: "Net Need — units/dollars still needed after current inventory and on-order.",
        NN_Plan: "Plan-driven net need (sales plan catch-up).",
        NN_Cust_Store:
          "Demand-sensed net need computed store-by-store then summed (gross). Often larger than NN Pool.",
        NN_Cust_Pool:
          "Same demand-sensed math at pool grain — nets surplus stores against short stores. Four Numbers NN Cust Store tile uses this pool figure.",
        Gross_Need_u:
          "Store x pool net need from Store Driven By-Store (Target - Curr Inv - On Order). Use this for a store's net need.",
        Store_Overstock:
          "Official WCRO Store Overstock tab calculations (Rule 1 = on-hand >= 3x LY cover; Rule 2 = slow turn / no LY signal >13 wks REVIEW). Excess $ is wholesale Plan pricing. Use for overstock questions — do not invent overstock from YTD.",
        maldistribution:
          "Gap between NN Cust Store (gross) and NN Cust Pool ≈ stock at the wrong stores.",
        pool:
          "WCRO pool = genus + form + size assortment. retailer_pool_sku = retailer SKU for that pool; everde_item_codes / top_items = member Everde items under the pool.",
      },
      rules: [
        "Lead with published WCRO figures you have (segments, top_pools_by_market, by_store_net_need, by_store_overstock, transfers, reps). Do not say pool, store net-need, or overstock data is missing when those fields are present.",
        "For a specific store's net need / store needs: call get_wcro_dashboard with store= (e.g. store=774) and lead with by_store_net_need (gross_need_u). Do NOT say store net need is unavailable when by_store_net_need_available is true.",
        "For overstock / overstocked items: call get_wcro_dashboard with store= and lead with by_store_overstock (excess_$, excess_u, rule, flag). Do NOT invent overstock from YTD sales/on-hand heuristics when by_store_overstock_available is true.",
        "gross_need_u = store net need; ship_u / ship_$ = ship recommendation for that store x pool — not a Write Order SKU line.",
        "For 'top pools': use genus/form/size + nn_cust_store_gross_$ + ship_$.",
        "When the user asks for SKUs / items / what to put on a spread: prefer retailer_pool_sku + top_items (item + item_description) and everde_item_codes from top_pools or by_store_net_need — do not stop at genus alone.",
        "Clarify: retailer_pool_sku = HD/Lowes pool SKU; Item codes like BOUBAF0405 = Everde item IDs; item_description = variety name.",
        "Ship This Week = in-region + FOR-direct; To Transfer = next-week shelf (not this week's order).",
        "NN Plan != NN Cust Store != NN Cust Pool — explain briefly if the user asks.",
        "YTD store sales + farm supply may support a secondary cross-check; label that as hypothesis, not the official WCRO order or overstock list.",
        "Never invent store x SKU Write Order lines that are not in this extract.",
        "Plan variance = Plan - Actual; positive = behind plan.",
        "LOW S.CA is not comparable to HD S.CA (LOW includes AZ/NV/NM/UT).",
        "HD on-hand is sales-gated (~12% fill) — caveat HD ship recs.",
        "Stay helpful: answer with the best grain available, cite snapshot date once, offer one clear next step — do not open with capability denials.",
        "Ops Adjustments / AM Setup / Xref: use focus=ops|am_setup|xref (or account_manager=). QC Release is a review list — do not say 'grade it up'. Wrong-plant and suspect xref rows are held (not shipped) until fixed.",
      ],
    };

    // Compact Ops & Sales Adjustments (Jonathan 5.51+)
    const ops = p.ops_adjustments as Record<string, unknown> | null | undefined;
    const am = p.am_setup_list as Record<string, unknown> | null | undefined;
    const xref = p.xref_exceptions as Record<string, unknown> | null | undefined;
    if (ops) {
      const qc = (ops.qc_release as Record<string, unknown>) ?? {};
      const top50 = Array.isArray(qc.top_50) ? (qc.top_50 as unknown[]).slice(0, 20) : [];
      const xfers = (ops.ops_transfers as Record<string, unknown>) ?? {};
      payload.ops_adjustments = {
        citrus: ops.citrus_inventory_changes,
        qc_totals_by_region: qc.totals_by_region,
        top_50_unlock_$: qc.top_50_unlock_$,
        all_regions_unlock_$: qc.all_regions_unlock_$,
        top_50: top50,
        transfers_into_S_CA: (xfers["into_S.CA"] as Record<string, unknown>)
          ? {
              total_transfer_$: (xfers["into_S.CA"] as Record<string, unknown>)
                .total_transfer_$,
              total_transfer_u: (xfers["into_S.CA"] as Record<string, unknown>)
                .total_transfer_u,
              lane_totals: (xfers["into_S.CA"] as Record<string, unknown>)
                .lane_totals,
              top_groups: (
                ((xfers["into_S.CA"] as Record<string, unknown>)
                  .top_groups as unknown[]) ?? []
              ).slice(0, 12),
            }
          : null,
        transfers_into_N_CA: (xfers["into_N.CA"] as Record<string, unknown>)
          ? {
              total_transfer_$: (xfers["into_N.CA"] as Record<string, unknown>)
                .total_transfer_$,
              total_transfer_u: (xfers["into_N.CA"] as Record<string, unknown>)
                .total_transfer_u,
              lane_totals: (xfers["into_N.CA"] as Record<string, unknown>)
                .lane_totals,
              top_groups: (
                ((xfers["into_N.CA"] as Record<string, unknown>)
                  .top_groups as unknown[]) ?? []
              ).slice(0, 12),
            }
          : null,
      };
    }
    if (am) {
      const byMgr = (am.by_manager as Record<string, unknown>) ?? {};
      let managers = Object.keys(byMgr);
      if (amFilter) {
        managers = managers.filter((m) => m.toLowerCase().includes(amFilter));
      }
      const compactMgr: Record<string, unknown> = {};
      for (const m of managers) {
        const sec = (byMgr[m] as Record<string, unknown>) ?? {};
        compactMgr[m] = {
          wrong_plants: (
            (sec.wrong_plants as unknown[]) ?? []
          ).slice(0, focusKey === "am_setup" ? 25 : 10),
          not_set_up: ((sec.not_set_up as unknown[]) ?? []).slice(
            0,
            focusKey === "am_setup" ? 15 : 8,
          ),
          other_market_only: (
            (sec.other_market_only as unknown[]) ?? []
          ).slice(0, focusKey === "am_setup" ? 15 : 8),
          egregious_on_hand: sec.egregious_on_hand ?? [],
        };
      }
      payload.am_setup_list = {
        summary: am.summary,
        by_manager: compactMgr,
      };
    }
    if (xref) {
      const hdRows = Array.isArray(xref.hd_suspect_rows)
        ? (xref.hd_suspect_rows as unknown[])
        : [];
      const lowRows = Array.isArray(xref.low_suspect_rows)
        ? (xref.low_suspect_rows as unknown[])
        : [];
      const lim = focusKey === "xref" ? 30 : 12;
      payload.xref_exceptions = {
        counts: xref.counts,
        note: xref.note,
        hd_suspect_rows:
          !channel || channel === "ALL" || channel === "HD"
            ? hdRows.slice(0, lim)
            : [],
        low_suspect_rows:
          !channel || channel === "ALL" || channel === "LOW"
            ? lowRows.slice(0, lim)
            : [],
      };
    }

    if (focusKey === "ops" && payload.ops_adjustments) {
      return truncateText(
        JSON.stringify({
          snapshot: snap,
          four_numbers: four,
          focus: "ops",
          ops_adjustments: payload.ops_adjustments,
          rules: payload.rules,
        }),
        maxChars,
      );
    }
    if (focusKey === "am_setup" && payload.am_setup_list) {
      return truncateText(
        JSON.stringify({
          snapshot: snap,
          four_numbers: four,
          focus: "am_setup",
          am_setup_list: payload.am_setup_list,
          rules: payload.rules,
        }),
        maxChars,
      );
    }
    if (focusKey === "xref" && payload.xref_exceptions) {
      return truncateText(
        JSON.stringify({
          snapshot: snap,
          four_numbers: four,
          focus: "xref",
          xref_exceptions: payload.xref_exceptions,
          rules: payload.rules,
        }),
        maxChars,
      );
    }

    if (storeKey) {
      payload.store_filter = storeKey;
      payload.by_store_net_need = byStoreRows.slice(0, 40);
      payload.by_store_net_need_matched = byStoreRows.length;
      payload.by_store_overstock = byOverstockRows.slice(0, 40);
      payload.by_store_overstock_matched = byOverstockRows.length;
      if (byStoreRows.length === 0 && byStoreTotal > 0) {
        payload.by_store_net_need_note =
          "No By-Store Gross Need rows for this store in the published extract (store may be outside WCRO West Coast scope this week). Still use top_pools_by_market for the market.";
      }
      if (byOverstockRows.length === 0 && byOverstockTotal > 0) {
        payload.by_store_overstock_note =
          "No Store Overstock rows for this store in the published WCRO extract this week.";
      }
    } else if (byStoreTotal > 0 || byOverstockTotal > 0) {
      payload.by_store_net_need_hint =
        "Pass store= (e.g. 774) to return that store's By-Store Gross Need (store net need) and Store Overstock rows.";
    }

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

/** Compact Sales by Item meta (never the full year×item×channel×rep grid). */
export function compactSalesByItemMeta(raw: string, maxChars: number): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const payload = {
      asOf: p.asOf,
      grain: p.grain,
      rowCount: p.rowCount,
      sourceRowCount: p.sourceRowCount,
      years: p.years,
      farmCount: p.farmCount,
      farms: Array.isArray(p.farms) ? (p.farms as string[]).slice(0, 30) : [],
      channelCount: Array.isArray(p.channels) ? p.channels.length : 0,
      channels: Array.isArray(p.channels)
        ? (p.channels as string[]).slice(0, 40)
        : [],
      sources: p.sources,
      note:
        p.note ||
        "Use get_sales_by_item focus=query. Farm+item: q='2025 2026 3G loropetalum Bunnell' (Location org; BNL=Bunnell). Store: q='2026 store 6910'. Customer/rep/item + year.",
    };
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}
