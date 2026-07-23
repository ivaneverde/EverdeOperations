import { gunzipSync } from "zlib";
import { downloadBytesFromBlob } from "../azure/downloadJson.js";
import { freightBlobContainer } from "../azure/blobPaths.js";
import {
  hdYtdRowsGzipPath,
  lowesYtdRowsGzipPath,
} from "../azure/blobPaths.js";
import { truncateText } from "./compact.js";

export type YtdKind = "hd" | "lowes";

type YtdCell = string | number | boolean | null;
type YtdRow = YtdCell[];

type CacheEntry = {
  columns: string[];
  rows: YtdRow[];
  loadedAt: number;
};

const g = globalThis as unknown as {
  __everdeYtdRowsCache?: Partial<Record<YtdKind, CacheEntry>>;
};

function cacheStore(): Partial<Record<YtdKind, CacheEntry>> {
  if (!g.__everdeYtdRowsCache) g.__everdeYtdRowsCache = {};
  return g.__everdeYtdRowsCache;
}

function rowsPath(kind: YtdKind): string {
  return kind === "lowes" ? lowesYtdRowsGzipPath() : hdYtdRowsGzipPath();
}

export async function loadYtdRowsCached(
  kind: YtdKind,
  columns: string[],
): Promise<YtdRow[] | null> {
  const store = cacheStore();
  const hit = store[kind];
  if (hit?.rows?.length) return hit.rows;

  const buf = await downloadBytesFromBlob(
    freightBlobContainer(),
    rowsPath(kind),
  );
  if (!buf) return null;
  try {
    const json = gunzipSync(buf).toString("utf8");
    const rows = JSON.parse(json) as YtdRow[];
    store[kind] = { columns, rows, loadedAt: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

function colIndex(columns: string[], ...needles: string[]): number {
  const lower = columns.map((c) => c.toLowerCase());
  for (const n of needles) {
    const i = lower.findIndex((c) => c === n || c.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Pad HD market/district/store codes to 4 digits when numeric. */
export function padHdCode(raw: string): string {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s) && s.length <= 4) return s.padStart(4, "0");
  return s;
}

type StructuredFilter = {
  market?: string;
  district?: string;
  store?: string;
  sku?: string;
  /** Plant Category needles from inventory/xref (e.g. shrub, evergreen). */
  categoryTokens: string[];
  textTokens: string[];
};

/** Parse "market 48", "district 25", "store 614", free-text store/SKU names. */
export function parseYtdQuery(q: string): StructuredFilter {
  const raw = q.trim();
  const out: StructuredFilter = { textTokens: [], categoryTokens: [] };
  let rest = raw;

  const take = (
    re: RegExp,
    key: "market" | "district" | "store" | "sku",
  ) => {
    const m = rest.match(re);
    if (!m) return;
    out[key] = padHdCode(m[1]);
    rest = rest.replace(m[0], " ");
  };

  take(/\bmarkets?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, "market");
  take(/\bdistricts?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, "district");
  take(/\bstores?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, "store");
  take(/\bskus?\s*(?:nbr|number|#|:)?\s*(\d{4,8})\b/i, "sku");

  // Bare leading codes when labeled elsewhere, e.g. "HD district 25"
  if (!out.district) {
    const m = rest.match(/\bd(?:istrict)?\s*(\d{1,4})\b/i);
    if (m && /district/i.test(raw)) {
      out.district = padHdCode(m[1]);
      rest = rest.replace(m[0], " ");
    }
  }

  // Category / subclass proxies (from HD xref Plant Category / XXTT CATEGORY)
  const catPatterns: Array<[RegExp, string]> = [
    [/\bshrub\s+evergreen\b/gi, "shrub evergreen"],
    [/\bshrub\s+deciduous\b/gi, "shrub deciduous"],
    [/\btree\s+evergreen\b/gi, "tree evergreen"],
    [/\btree\s+deciduous\b/gi, "tree deciduous"],
    [/\bsucculent(?:\/cactus)?\b/gi, "succulent"],
    [/\bazalea(?:\/rhododendron)?\b/gi, "azalea"],
    [/\bgrass[\s-]*like\b/gi, "grass"],
    [/\bperennial\b/gi, "perennial"],
    [/\bconifer\b/gi, "conifer"],
    [/\bedible\b/gi, "edible"],
    [/\bvine\b/gi, "vine"],
    [/\bsubclass\s+shrub\b/gi, "shrub"],
    [/\bshrub\b/gi, "shrub"],
    [/\blandscape\b/gi, "landscape"],
  ];
  for (const [re, token] of catPatterns) {
    if (re.test(rest)) {
      out.categoryTokens.push(token);
      rest = rest.replace(re, " ");
    }
  }
  // de-dupe
  out.categoryTokens = [...new Set(out.categoryTokens)];

  const stop = new Set([
    "hd",
    "home",
    "depot",
    "lowes",
    "lowe's",
    "ytd",
    "comps",
    "comp",
    "this",
    "year",
    "for",
    "in",
    "the",
    "and",
    "or",
    "a",
    "of",
    "what",
    "is",
    "are",
    "subclass",
    "category",
    "between",
    "with",
  ]);

  out.textTokens = rest
    .toLowerCase()
    .split(/[\s,/|]+/)
    .map((t) => t.trim())
    .filter((t) => t && !stop.has(t) && !/^\d+$/.test(t));

  return out;
}

function cellEqCode(cell: YtdCell, code: string): boolean {
  const a = padHdCode(String(cell ?? ""));
  const b = padHdCode(code);
  return a === b || String(cell ?? "").trim() === code.trim();
}

export type SkuCategoryLookup = Record<string, string>;

/** Normalize HD/Lowe's SKU keys for map lookup. */
export function skuLookupKeys(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const keys = new Set<string>([s]);
  if (/^\d+$/.test(s)) {
    keys.add(String(Number(s)));
    keys.add(s.replace(/^0+/, "") || "0");
  }
  return [...keys];
}

export function lookupSkuCategory(
  sku: string,
  map: SkuCategoryLookup | null | undefined,
): string | null {
  if (!map) return null;
  for (const k of skuLookupKeys(sku)) {
    const hit = map[k];
    if (hit) return hit;
  }
  return null;
}

function categoryMatches(
  category: string | null,
  tokens: string[],
  skuName: string,
): boolean {
  if (tokens.length === 0) return true;
  const cat = (category ?? "").toLowerCase();
  const name = skuName.toLowerCase();
  return tokens.every((t) => {
    if (t === "landscape") {
      // Retail "landscape" often appears in SKU Name when not a Plant Category
      return (
        /\blandscape\b/.test(name) ||
        cat.includes("shrub") ||
        cat.includes("tree") ||
        cat.includes("conifer")
      );
    }
    return cat.includes(t) || name.includes(t);
  });
}

/**
 * Filter HD/Lowe's YTD rows.
 * Prefer exact Market / District / Store / SKU column matches (4-digit padded).
 * Do NOT substring-match short numeric codes against SKU/KEY (that caused 38k false hits).
 * Optional skuCategory map joins Plant Category from the HD/Lowe's xref.
 */
export function filterYtdRows(
  rows: YtdRow[],
  columns: string[],
  q: string,
  skuCategory?: SkuCategoryLookup | null,
): YtdRow[] {
  const parsed = parseYtdQuery(q);
  const marketI = colIndex(columns, "market nbr", "market");
  const districtI = colIndex(columns, "district nbr", "district");
  const storeI = colIndex(columns, "store nbr");
  const storeNameI = colIndex(columns, "store name");
  const skuI = colIndex(columns, "sku nbr", "item");
  const skuNameI = colIndex(columns, "sku name", "item name", "desc");
  const subregionI = colIndex(columns, "subregion");
  const keyI = colIndex(columns, "key");

  const hasStructured =
    Boolean(parsed.market) ||
    Boolean(parsed.district) ||
    Boolean(parsed.store) ||
    Boolean(parsed.sku);

  // Bare numeric query like "48" or "614" → prefer store, then market, then district
  let bareCode: string | null = null;
  if (!hasStructured) {
    const bare = q.trim().match(/^#?(\d{1,4})$/);
    if (bare) bareCode = padHdCode(bare[1]);
  }

  return rows.filter((row) => {
    if (parsed.market && marketI >= 0) {
      if (!cellEqCode(row[marketI], parsed.market)) return false;
    }
    if (parsed.district && districtI >= 0) {
      if (!cellEqCode(row[districtI], parsed.district)) return false;
    }
    if (parsed.store && storeI >= 0) {
      if (!cellEqCode(row[storeI], parsed.store)) return false;
    }
    if (parsed.sku && skuI >= 0) {
      if (!cellEqCode(row[skuI], parsed.sku)) return false;
    }

    if (bareCode) {
      const hit =
        (storeI >= 0 && cellEqCode(row[storeI], bareCode)) ||
        (marketI >= 0 && cellEqCode(row[marketI], bareCode)) ||
        (districtI >= 0 && cellEqCode(row[districtI], bareCode));
      if (!hit) return false;
    }

    if (parsed.categoryTokens.length > 0) {
      const sku = skuI >= 0 ? String(row[skuI] ?? "") : "";
      const skuName = skuNameI >= 0 ? String(row[skuNameI] ?? "") : "";
      const cat = lookupSkuCategory(sku, skuCategory);
      if (!categoryMatches(cat, parsed.categoryTokens, skuName)) return false;
    }

    if (parsed.textTokens.length === 0) return true;

    const nameHay = [
      storeNameI >= 0 ? row[storeNameI] : "",
      skuNameI >= 0 ? row[skuNameI] : "",
      subregionI >= 0 ? row[subregionI] : "",
      keyI >= 0 ? row[keyI] : "",
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" | ");

    return parsed.textTokens.every((t) => nameHay.includes(t));
  });
}

function num(v: YtdCell): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function summarizeYtdFilter(
  columns: string[],
  rows: YtdRow[],
  q: string,
  skuCategory?: SkuCategoryLookup | null,
): Record<string, unknown> {
  const parsed = parseYtdQuery(q);
  const marketI = colIndex(columns, "market nbr", "market");
  const districtI = colIndex(columns, "district nbr", "district");
  const storeI = colIndex(columns, "store nbr");
  const storeNameI = colIndex(columns, "store name");
  const skuI = colIndex(columns, "sku nbr", "item");
  const skuNameI = colIndex(columns, "sku name", "item name", "desc");
  const salesI = colIndex(columns, "sales retail ytd");
  const lySalesI = colIndex(columns, "ly sales retail");
  const changeI = colIndex(columns, "sales change retail");
  const unitsI = colIndex(columns, "sales units");
  const lyUnitsI = colIndex(columns, "ly sales units");
  const unitsChangeI = colIndex(columns, "sales change units");
  const invRetailI = colIndex(columns, "curr inventory retail");
  const lyInvRetailI = colIndex(columns, "ly curr inventory retail");
  const invRetailChgI = colIndex(columns, "curr inv. retail change", "curr inv retail change");
  const invUnitsI = colIndex(columns, "current inventory");
  const lyInvUnitsI = colIndex(columns, "inventory ly");
  const invUnitsChgI = colIndex(columns, "curr inv. units change", "curr inv units change");

  const markets = new Set<string>();
  const districts = new Set<string>();
  const stores = new Map<string, string>();
  const categories = new Map<string, number>();
  let sales = 0;
  let lySales = 0;
  let salesChange = 0;
  let units = 0;
  let lyUnits = 0;
  let unitsChange = 0;
  let categoryHits = 0;

  let invRetail = 0;
  let lyInvRetail = 0;
  let invRetailChange = 0;
  let invUnits = 0;
  let lyInvUnits = 0;
  let invUnitsChange = 0;
  let skusWithCurrOh = 0;
  let skusWithLyOh = 0;
  let invRetailRows = 0;
  let lyInvRetailRows = 0;

  type TopInv = {
    sku: string;
    name: string;
    curr_inv_retail: number;
    ly_inv_retail: number;
    curr_units: number;
    ly_units: number;
  };
  const topInvCandidates: TopInv[] = [];

  for (const row of rows) {
    if (marketI >= 0) markets.add(padHdCode(String(row[marketI] ?? "")));
    if (districtI >= 0) districts.add(padHdCode(String(row[districtI] ?? "")));
    if (storeI >= 0) {
      const sn = padHdCode(String(row[storeI] ?? ""));
      const name =
        storeNameI >= 0 ? String(row[storeNameI] ?? "") : "";
      if (sn) stores.set(sn, name);
    }
    if (skuI >= 0 && skuCategory) {
      const cat = lookupSkuCategory(String(row[skuI] ?? ""), skuCategory);
      if (cat) {
        categoryHits += 1;
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }
    }
    if (salesI >= 0) sales += num(row[salesI]);
    if (lySalesI >= 0) lySales += num(row[lySalesI]);
    if (changeI >= 0) salesChange += num(row[changeI]);
    if (unitsI >= 0) units += num(row[unitsI]);
    if (lyUnitsI >= 0) lyUnits += num(row[lyUnitsI]);
    if (unitsChangeI >= 0) unitsChange += num(row[unitsChangeI]);

    const curR = invRetailI >= 0 ? num(row[invRetailI]) : 0;
    const lyR = lyInvRetailI >= 0 ? num(row[lyInvRetailI]) : 0;
    const curU = invUnitsI >= 0 ? num(row[invUnitsI]) : 0;
    const lyU = lyInvUnitsI >= 0 ? num(row[lyInvUnitsI]) : 0;
    if (invRetailI >= 0 && row[invRetailI] != null && row[invRetailI] !== "") {
      invRetail += curR;
      invRetailRows += 1;
    }
    if (lyInvRetailI >= 0 && row[lyInvRetailI] != null && row[lyInvRetailI] !== "") {
      lyInvRetail += lyR;
      lyInvRetailRows += 1;
    }
    if (invRetailChgI >= 0) invRetailChange += num(row[invRetailChgI]);
    if (invUnitsI >= 0 && row[invUnitsI] != null && row[invUnitsI] !== "") {
      invUnits += curU;
      if (curU > 0) skusWithCurrOh += 1;
    }
    if (lyInvUnitsI >= 0 && row[lyInvUnitsI] != null && row[lyInvUnitsI] !== "") {
      lyInvUnits += lyU;
      if (lyU > 0) skusWithLyOh += 1;
    }
    if (invUnitsChgI >= 0) invUnitsChange += num(row[invUnitsChgI]);

    if (curR > 0 || curU > 0) {
      topInvCandidates.push({
        sku: skuI >= 0 ? String(row[skuI] ?? "") : "",
        name: skuNameI >= 0 ? String(row[skuNameI] ?? "") : "",
        curr_inv_retail: Math.round(curR * 100) / 100,
        ly_inv_retail: Math.round(lyR * 100) / 100,
        curr_units: Math.round(curU),
        ly_units: Math.round(lyU),
      });
    }
  }

  topInvCandidates.sort((a, b) => b.curr_inv_retail - a.curr_inv_retail);
  const compPct = lySales !== 0 ? (salesChange / lySales) * 100 : null;
  const invRetailCompPct =
    lyInvRetail !== 0
      ? ((invRetail - lyInvRetail) / lyInvRetail) * 100
      : null;

  return {
    parsed_filter: parsed,
    matched_rows: rows.length,
    markets: [...markets].sort(),
    districts: [...districts].sort(),
    store_count: stores.size,
    stores: [...stores.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 40)
      .map(([nbr, name]) => ({ store_nbr: nbr, store_name: name })),
    plant_category: {
      source:
        "HD/Lowe's Inventory Cross Reference Plant Category (same as XXTT inventory CATEGORY). Not a native Subclass column on the YTD workbook.",
      map_available: Boolean(skuCategory),
      rows_with_category: categoryHits,
      top_categories: [...categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([category, rows]) => ({ category, rows })),
    },
    comps: {
      sales_retail_ytd: Math.round(sales * 100) / 100,
      ly_sales_retail: Math.round(lySales * 100) / 100,
      sales_change_retail: Math.round(salesChange * 100) / 100,
      sales_comp_pct: compPct != null ? Math.round(compPct * 100) / 100 : null,
      sales_units: Math.round(units),
      ly_sales_units: Math.round(lyUnits),
      sales_change_units: Math.round(unitsChange),
    },
    /** FULL matched-row aggregates — use these for store/market totals, NOT the sample rows. */
    inventory: {
      scope: `All ${rows.length} matched rows (not the sample)`,
      curr_inventory_retail: Math.round(invRetail * 100) / 100,
      ly_curr_inventory_retail: Math.round(lyInvRetail * 100) / 100,
      curr_inv_retail_change: Math.round(invRetailChange * 100) / 100,
      inventory_retail_comp_pct:
        invRetailCompPct != null
          ? Math.round(invRetailCompPct * 100) / 100
          : null,
      current_inventory_units: Math.round(invUnits),
      inventory_ly_units: Math.round(lyInvUnits),
      curr_inv_units_change: Math.round(invUnitsChange),
      skus_with_curr_on_hand: skusWithCurrOh,
      skus_with_ly_on_hand: skusWithLyOh,
      rows_with_curr_inv_retail: invRetailRows,
      rows_with_ly_inv_retail: lyInvRetailRows,
      top_skus_by_curr_inv_retail: topInvCandidates.slice(0, 15),
      columns_used: [
        "Curr Inventory Retail",
        "LY Curr Inventory Retail",
        "Current Inventory",
        "Inventory LY",
      ],
      answer_hint:
        "For 'total dollars on hand' / 'in hands this year vs last year' report inventory.curr_inventory_retail vs inventory.ly_curr_inventory_retail (and units). Do NOT say these columns are missing. Do NOT estimate from Sales÷Units. Do NOT use only the 50-row sample for store totals.",
    },
    notes: [
      "Market Nbr / District Nbr / Store Nbr are 4-digit zero-padded (48 → 0048, 25 → 0025, 614 → 0614).",
      "YTD Following Week has no Subclass column — Plant Category is joined from the HD/Lowe's xref (e.g. SHRUB EVERGREEN). Filter with q= like 'shrub evergreen' or 'shrub'.",
      "On-hand $ is Curr Inventory Retail / LY Curr Inventory Retail — summed in inventory.* across ALL matched rows.",
    ],
  };
}

export function formatYtdSample(
  columns: string[],
  rows: YtdRow[],
  maxRows: number,
  maxChars: number,
  q?: string,
  skuCategory?: SkuCategoryLookup | null,
): string {
  const prefer = [
    "KEY",
    "Market Nbr",
    "District Nbr",
    "Store Nbr",
    "Store Name",
    "SKU Nbr",
    "SKU Name",
    "Curr Inventory Retail",
    "LY Curr Inventory Retail",
    "Curr Inv. Retail Change",
    "Current Inventory",
    "Inventory LY",
    "Curr Inv. Units Change",
    "Sales Retail YTD",
    "LY Sales Retail",
    "Sales Change Retail",
    "Sales Units",
    "LY Sales Units",
    "Sales Change Units",
    "Subregion",
  ];
  const showCols = [
    ...prefer.filter((c) => columns.includes(c)),
    ...columns.filter((c) => !prefer.includes(c)).slice(0, 8),
  ].slice(0, 18);

  const skuI = colIndex(columns, "sku nbr", "item");
  const invRetailI = colIndex(columns, "curr inventory retail");

  // Prefer highest on-hand $ rows in the sample when that column exists
  const ordered =
    invRetailI >= 0
      ? [...rows].sort((a, b) => num(b[invRetailI]) - num(a[invRetailI]))
      : rows;

  const sample = ordered.slice(0, maxRows).map((row) => {
    const obj: Record<string, YtdCell> = {};
    for (const c of showCols) {
      const i = columns.indexOf(c);
      if (i >= 0) obj[c] = row[i] ?? null;
    }
    if (skuI >= 0 && skuCategory) {
      const cat = lookupSkuCategory(String(row[skuI] ?? ""), skuCategory);
      if (cat) obj["Plant Category"] = cat;
    }
    return obj;
  });

  const payload: Record<string, unknown> = {
    // summary FIRST so store inventory totals survive truncation
    ...(q
      ? { summary: summarizeYtdFilter(columns, rows, q, skuCategory) }
      : {}),
    returned_sample: sample.length,
    sample_note:
      "Sample rows are illustrative (sorted by Curr Inventory Retail when available). Store/market TOTALS are only in summary.inventory / summary.comps across all matched rows.",
    columns_shown: [
      ...showCols,
      ...(skuCategory ? ["Plant Category (from xref)"] : []),
    ],
    rows: sample,
  };

  return truncateText(JSON.stringify(payload), maxChars);
}
