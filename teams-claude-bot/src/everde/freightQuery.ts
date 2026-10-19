import { truncateText } from "./compact.js";

/** One Year×Customer×Region×Ship Type row from extract customer_drill. */
export type FreightCustomerDrillRow = {
  Year?: number | null;
  Customer?: string | null;
  Region?: string | null;
  "Ship Type"?: string | null;
  loads?: number;
  drops?: number;
  eus?: number;
  miles?: number;
  revenue?: number;
  recovery?: number;
  cost?: number;
  net?: number;
  cost_pct_rev?: number | null;
};

export type FreightQueryParsed = {
  years: number[];
  customer?: string;
  regions: string[];
  shipTypes: string[];
  /** Raw leftover tokens (debug). */
  tokens: string[];
};

const REGION_ALIASES: Record<string, string> = {
  tx: "TX",
  texas: "TX",
  fl: "FL",
  florida: "FL",
  for: "FOR",
  foreign: "FOR",
  "n.ca": "N. CA",
  "n ca": "N. CA",
  nca: "N. CA",
  norcal: "N. CA",
  "northern california": "N. CA",
  "s.ca": "S. CA",
  "s ca": "S. CA",
  sca: "S. CA",
  socal: "S. CA",
  "southern california": "S. CA",
};

const SHIP_TYPE_PATTERNS: { keys: RegExp; match: RegExp; label: string }[] = [
  {
    keys: /\b(3p|3rd\s*party|third[\s-]*party|3rd)\b/i,
    match: /3RD|THIRD/i,
    label: "3rd Party Freight",
  },
  {
    keys: /\binternal\b/i,
    match: /INTERNAL/i,
    label: "INTERNAL",
  },
  {
    keys: /\bcpu\b/i,
    match: /CPU/i,
    label: "CPU",
  },
];

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "for",
  "to",
  "by",
  "with",
  "and",
  "or",
  "our",
  "as",
  "pct",
  "percent",
  "%",
  "percentage",
  "revenue",
  "rev",
  "cost",
  "costs",
  "freight",
  "frt",
  "only",
  "just",
  "look",
  "at",
  "it",
  "ytd",
  "year",
  "what",
  "is",
  "are",
  "how",
  "much",
  "many",
  "show",
  "me",
  "get",
  "tell",
  "about",
  "please",
  "want",
  "you",
  "to",
  "customer",
  "customers",
  "region",
  "ship",
  "type",
  "shipping",
  "load",
  "loads",
]);

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractYears(q: string): number[] {
  const years: number[] = [];
  for (const m of q.matchAll(/\b(20\d{2})\b/g)) {
    const y = Number(m[1]);
    if (y >= 2020 && y <= 2035 && !years.includes(y)) years.push(y);
  }
  return years;
}

function extractRegions(q: string): string[] {
  const lower = norm(q);
  const found: string[] = [];
  const add = (r: string) => {
    if (!found.includes(r)) found.push(r);
  };
  // Longer phrases first
  for (const [alias, region] of Object.entries(REGION_ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const re = new RegExp(
      `(?:^|[^a-z0-9.])${alias.replace(/\./g, "\\.")}(?:$|[^a-z0-9.])`,
      "i",
    );
    if (re.test(lower)) add(region);
  }
  return found;
}

function extractShipTypes(q: string): { patterns: RegExp[]; labels: string[] } {
  const patterns: RegExp[] = [];
  const labels: string[] = [];
  for (const p of SHIP_TYPE_PATTERNS) {
    if (p.keys.test(q)) {
      patterns.push(p.match);
      labels.push(p.label);
    }
  }
  return { patterns, labels };
}

/** Pull a customer phrase: known big accounts first, else leftover tokens. */
function extractCustomer(q: string, usedSpans: string[]): string | undefined {
  const lower = norm(q);
  const known = [
    "costco",
    "home depot",
    "lowe's",
    "lowes",
    "walmart",
    "target",
    "sam's club",
    "sams club",
    "fast growing trees",
  ];
  for (const name of known) {
    if (lower.includes(name)) return name;
  }

  let rest = lower;
  for (const span of usedSpans) {
    rest = rest.replace(new RegExp(span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  rest = rest.replace(/\b20\d{2}\b/g, " ");
  const tokens = rest
    .split(/[^a-z0-9']+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
  if (tokens.length === 0) return undefined;
  return tokens.join(" ");
}

export function parseFreightQuery(q: string): FreightQueryParsed {
  const years = extractYears(q);
  const regions = extractRegions(q);
  const { patterns: _shipPatterns, labels: shipLabels } = extractShipTypes(q);
  const shipTypes = shipLabels;

  const usedSpans = [
    ...regions.flatMap((r) => {
      const aliases = Object.entries(REGION_ALIASES)
        .filter(([, v]) => v === r)
        .map(([k]) => k);
      return aliases;
    }),
    ...["3p", "3rd party", "third party", "3rd", "internal", "cpu", "texas", "florida"],
  ];
  const customer = extractCustomer(q, usedSpans);
  const tokens = norm(q)
    .split(/[^a-z0-9']+/)
    .filter((t) => t && !STOP.has(t));

  return {
    years,
    customer,
    regions,
    shipTypes,
    tokens,
  };
}

function customerMatches(rowCustomer: string, needle: string): boolean {
  const a = norm(rowCustomer);
  const b = norm(needle);
  if (!b) return true;
  return a.includes(b) || b.includes(a);
}

function regionMatches(rowRegion: string, regions: string[]): boolean {
  if (regions.length === 0) return true;
  const r = String(rowRegion ?? "").trim().toUpperCase();
  return regions.some((want) => r === want.toUpperCase());
}

function shipTypeMatches(rowShip: string, labels: string[]): boolean {
  if (labels.length === 0) return true;
  const s = String(rowShip ?? "");
  for (const label of labels) {
    const pat = SHIP_TYPE_PATTERNS.find((p) => p.label === label);
    if (pat && pat.match.test(s)) return true;
    if (s.toLowerCase().includes(label.toLowerCase())) return true;
  }
  return false;
}

function yearMatches(rowYear: number | null | undefined, years: number[]): boolean {
  if (years.length === 0) return true;
  if (rowYear == null) return false;
  return years.includes(Number(rowYear));
}

function sumRows(rows: FreightCustomerDrillRow[]) {
  let loads = 0;
  let drops = 0;
  let eus = 0;
  let miles = 0;
  let revenue = 0;
  let recovery = 0;
  let cost = 0;
  let net = 0;
  for (const r of rows) {
    loads += Number(r.loads) || 0;
    drops += Number(r.drops) || 0;
    eus += Number(r.eus) || 0;
    miles += Number(r.miles) || 0;
    revenue += Number(r.revenue) || 0;
    recovery += Number(r.recovery) || 0;
    cost += Number(r.cost) || 0;
    net += Number(r.net) || 0;
  }
  const cost_pct_rev = revenue > 0 ? cost / revenue : null;
  return {
    loads,
    drops,
    eus: Math.round(eus),
    miles: Math.round(miles * 10) / 10,
    revenue: Math.round(revenue * 100) / 100,
    recovery: Math.round(recovery * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    net: Math.round(net * 100) / 100,
    cost_pct_rev:
      cost_pct_rev == null ? null : Math.round(cost_pct_rev * 10000) / 10000,
    cost_pct_rev_display:
      cost_pct_rev == null ? null : `${(cost_pct_rev * 100).toFixed(2)}%`,
  };
}

/**
 * Filter customer_drill and return load-level Frt Cost totals.
 * NEVER prorate regional 3P × customer revenue share.
 */
export function queryFreightCustomerDrill(
  rows: FreightCustomerDrillRow[],
  q: string,
): Record<string, unknown> {
  const parsed = parseFreightQuery(q);
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      error: "customer_drill missing — republish freight dashboard JSON.",
      parsed,
      note: "Costs are load-level Frt Cost from Master Data. Never prorate regional 3P by customer revenue share.",
    };
  }

  let filtered = rows.filter((r) => {
    if (!yearMatches(r.Year, parsed.years)) return false;
    if (parsed.customer && !customerMatches(String(r.Customer ?? ""), parsed.customer)) {
      return false;
    }
    if (!regionMatches(String(r.Region ?? ""), parsed.regions)) return false;
    if (!shipTypeMatches(String(r["Ship Type"] ?? ""), parsed.shipTypes)) {
      return false;
    }
    return true;
  });

  // If ship type was requested, also compute same customer×region across all ship types
  // so we can report cost as % of total customer revenue in scope.
  let allShipTypesSameScope: FreightCustomerDrillRow[] = [];
  if (parsed.customer || parsed.regions.length || parsed.years.length) {
    allShipTypesSameScope = rows.filter((r) => {
      if (!yearMatches(r.Year, parsed.years)) return false;
      if (
        parsed.customer &&
        !customerMatches(String(r.Customer ?? ""), parsed.customer)
      ) {
        return false;
      }
      if (!regionMatches(String(r.Region ?? ""), parsed.regions)) return false;
      return true;
    });
  }

  const matched = sumRows(filtered);
  const scopeAllShip = sumRows(allShipTypesSameScope);

  // Breakdown by ship type within customer×region×year (helpful labels)
  const byShipType: Record<string, ReturnType<typeof sumRows>> = {};
  const grouped = new Map<string, FreightCustomerDrillRow[]>();
  for (const r of allShipTypesSameScope.length ? allShipTypesSameScope : filtered) {
    const st = String(r["Ship Type"] ?? "(blank)");
    const list = grouped.get(st) ?? [];
    list.push(r);
    grouped.set(st, list);
  }
  for (const [st, list] of grouped) {
    byShipType[st] = sumRows(list);
  }

  const sampleRows = filtered.slice(0, 15).map((r) => ({
    Year: r.Year,
    Customer: r.Customer,
    Region: r.Region,
    "Ship Type": r["Ship Type"],
    loads: r.loads,
    revenue: r.revenue,
    cost: r.cost,
    cost_pct_rev: r.cost_pct_rev,
  }));

  const denomTotal = scopeAllShip.revenue;
  const denom3p = matched.revenue;
  const costVsTotalRev =
    denomTotal > 0 ? matched.cost / denomTotal : null;
  const costVs3pRev = denom3p > 0 ? matched.cost / denom3p : null;

  return {
    parsed,
    matched_rows: filtered.length,
    customer_drill_total_rows: rows.length,
    /** Filtered grain (e.g. Costco × TX × 3P) — cost is Frt Cost, not prorata. */
    matched_totals: matched,
    /** Same customer×region×year across all ship types (denominator for “% of Costco TX revenue”). */
    scope_all_ship_types: scopeAllShip,
    metrics: {
      third_party_frt_cost: matched.cost,
      third_party_revenue: matched.revenue,
      customer_region_total_revenue: scopeAllShip.revenue,
      cost_pct_of_3p_revenue: costVs3pRev,
      cost_pct_of_3p_revenue_display:
        costVs3pRev == null ? null : `${(costVs3pRev * 100).toFixed(2)}%`,
      cost_pct_of_customer_region_total_revenue: costVsTotalRev,
      cost_pct_of_customer_region_total_revenue_display:
        costVsTotalRev == null ? null : `${(costVsTotalRev * 100).toFixed(2)}%`,
    },
    by_ship_type: byShipType,
    sample_rows: sampleRows,
    note:
      "Costs are load-level Frt Cost from Master Data (same metric as tp_region / region_kpis). " +
      "NEVER allocate / prorate regional 3P totals by customer revenue share. " +
      "Report both: (1) 3P cost ÷ Costco TX 3P revenue, and (2) 3P cost ÷ Costco TX total revenue (all ship types).",
  };
}

export function formatFreightCustomerQuery(
  rows: FreightCustomerDrillRow[],
  q: string,
  maxChars = 12000,
): string {
  const result = queryFreightCustomerDrill(rows, q);
  return truncateText(JSON.stringify(result), maxChars);
}

export function customerDrillFromFreightJson(
  raw: string,
): FreightCustomerDrillRow[] | null {
  try {
    const p = JSON.parse(raw) as { customer_drill?: FreightCustomerDrillRow[] };
    if (!Array.isArray(p.customer_drill)) return null;
    return p.customer_drill;
  } catch {
    return null;
  }
}
