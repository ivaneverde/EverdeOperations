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
      "weeklyTotals",
      "topReasons",
    ]);
    payload.farms = slimArray(p.farms, 20);
    payload.farmBO = slimArray(p.farmBO, 20);
    payload.farmYTD = slimArray(p.farmYTD, 20);
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

/** Compact nursery supply (price list) — never dump full SKU lines in snapshot. */
export function compactNurserySupplyJson(
  raw: string,
  maxChars: number,
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const meta = (p.meta ?? {}) as Record<string, unknown>;
    const payload = {
      meta,
      grades: p.grades ?? null,
      regions: p.regions ?? null,
      farmGradeMatrix: p.farmGradeMatrix ?? null,
      oversold: slimArray(p.oversold, 10),
      note: "For Grade A/B × farm/region × product (e.g. Japanese Boxwood 1G), use get_nursery_supply with focus=query and q=.",
    };
    return truncateText(JSON.stringify(payload), maxChars);
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
