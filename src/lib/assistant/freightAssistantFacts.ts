type CarrierRow = {
  Carrier?: string;
  Cost?: number;
  cost_per_mile?: number;
  Loads?: number;
  Miles?: number;
  Revenue?: number;
};

type TopCarriersByYear = Record<string, CarrierRow[]>;

function asTopCarriers(value: unknown): TopCarriersByYear | null {
  if (!value || typeof value !== "object") return null;
  const out: TopCarriersByYear = {};
  for (const [year, rows] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(rows)) out[year] = rows as CarrierRow[];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Pre-computed answers the model should cite for common freight questions. */
export function buildFreightAssistantFacts(
  root: Record<string, unknown>,
): Record<string, unknown> {
  const topCarriers = asTopCarriers(root.top_carriers);
  if (!topCarriers) {
    return {
      _warning:
        "top_carriers missing from freight JSON — cannot rank carriers by name.",
    };
  }

  const years = Object.keys(topCarriers).sort(
    (a, b) => Number(b) - Number(a),
  );
  const latestYear = years[0] ?? "";
  const latest = topCarriers[latestYear] ?? [];

  const byTotalCost = [...latest].sort(
    (a, b) => (b.Cost ?? 0) - (a.Cost ?? 0),
  );
  const byCostPerMile = [...latest]
    .filter((c) => (c.Loads ?? 0) >= 3 && (c.Miles ?? 0) > 0)
    .sort((a, b) => (b.cost_per_mile ?? 0) - (a.cost_per_mile ?? 0));

  const facts: Record<string, unknown> = {
    data_note:
      "YTD 3rd-party carrier rankings from dashboard top_carriers (sorted by total Cost in extract).",
    latest_year: latestYear,
    most_expensive_carrier_by_total_ytd_cost: rowFact(byTotalCost[0]),
    highest_cost_per_mile_carrier_min_3_loads: rowFact(byCostPerMile[0]),
    top_carriers_by_total_cost: byTotalCost.slice(0, 12).map(rowFact),
    top_carriers_by_cost_per_mile: byCostPerMile.slice(0, 8).map(rowFact),
    years_available: years,
  };

  if (years.length > 1) {
    const priorYear = years[1];
    const prior = topCarriers[priorYear] ?? [];
    const priorTop = [...prior].sort((a, b) => (b.Cost ?? 0) - (a.Cost ?? 0));
    facts.prior_year = priorYear;
    facts.prior_year_top_carrier_by_cost = rowFact(priorTop[0]);
  }

  return facts;
}

function rowFact(row: CarrierRow | undefined) {
  if (!row?.Carrier) return null;
  return {
    carrier: row.Carrier,
    cost: row.Cost,
    cost_per_mile: row.cost_per_mile,
    loads: row.Loads,
    miles: row.Miles,
    revenue: row.Revenue,
  };
}
