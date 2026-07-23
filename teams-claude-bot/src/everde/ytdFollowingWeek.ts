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
  textTokens: string[];
};

/** Parse "market 48", "district 25", "store 614", free-text store/SKU names. */
export function parseYtdQuery(q: string): StructuredFilter {
  const raw = q.trim();
  const out: StructuredFilter = { textTokens: [] };
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
    "shrub",
    "landscape",
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

/**
 * Filter HD/Lowe's YTD rows.
 * Prefer exact Market / District / Store / SKU column matches (4-digit padded).
 * Do NOT substring-match short numeric codes against SKU/KEY (that caused 38k false hits).
 */
export function filterYtdRows(
  rows: YtdRow[],
  columns: string[],
  q: string,
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
): Record<string, unknown> {
  const parsed = parseYtdQuery(q);
  const marketI = colIndex(columns, "market nbr", "market");
  const districtI = colIndex(columns, "district nbr", "district");
  const storeI = colIndex(columns, "store nbr");
  const storeNameI = colIndex(columns, "store name");
  const salesI = colIndex(columns, "sales retail ytd");
  const lySalesI = colIndex(columns, "ly sales retail");
  const changeI = colIndex(columns, "sales change retail");
  const unitsI = colIndex(columns, "sales units");
  const lyUnitsI = colIndex(columns, "ly sales units");
  const unitsChangeI = colIndex(columns, "sales change units");

  const markets = new Set<string>();
  const districts = new Set<string>();
  const stores = new Map<string, string>();
  let sales = 0;
  let lySales = 0;
  let salesChange = 0;
  let units = 0;
  let lyUnits = 0;
  let unitsChange = 0;

  for (const row of rows) {
    if (marketI >= 0) markets.add(padHdCode(String(row[marketI] ?? "")));
    if (districtI >= 0) districts.add(padHdCode(String(row[districtI] ?? "")));
    if (storeI >= 0) {
      const sn = padHdCode(String(row[storeI] ?? ""));
      const name =
        storeNameI >= 0 ? String(row[storeNameI] ?? "") : "";
      if (sn) stores.set(sn, name);
    }
    if (salesI >= 0) sales += num(row[salesI]);
    if (lySalesI >= 0) lySales += num(row[lySalesI]);
    if (changeI >= 0) salesChange += num(row[changeI]);
    if (unitsI >= 0) units += num(row[unitsI]);
    if (lyUnitsI >= 0) lyUnits += num(row[lyUnitsI]);
    if (unitsChangeI >= 0) unitsChange += num(row[unitsChangeI]);
  }

  const compPct = lySales !== 0 ? (salesChange / lySales) * 100 : null;

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
    comps: {
      sales_retail_ytd: Math.round(sales * 100) / 100,
      ly_sales_retail: Math.round(lySales * 100) / 100,
      sales_change_retail: Math.round(salesChange * 100) / 100,
      sales_comp_pct: compPct != null ? Math.round(compPct * 100) / 100 : null,
      sales_units: Math.round(units),
      ly_sales_units: Math.round(lyUnits),
      sales_change_units: Math.round(unitsChange),
    },
    notes: [
      "Market Nbr / District Nbr / Store Nbr are 4-digit zero-padded (48 → 0048, 25 → 0025, 614 → 0614).",
      "This HD YTD Following Week grid is store×SKU — it does not include a Subclass column (Shrub/Landscape). Filter by Market/District/Store/SKU Name keywords instead, or use another retail report for subclass.",
    ],
  };
}

export function formatYtdSample(
  columns: string[],
  rows: YtdRow[],
  maxRows: number,
  maxChars: number,
  q?: string,
): string {
  const prefer = [
    "KEY",
    "Market Nbr",
    "District Nbr",
    "Store Nbr",
    "Store Name",
    "SKU Nbr",
    "SKU Name",
    "Sales Retail YTD",
    "LY Sales Retail",
    "Sales Change Retail",
    "Sales Units",
    "LY Sales Units",
    "Sales Change Units",
    "Current Inventory",
    "Subregion",
  ];
  const showCols = [
    ...prefer.filter((c) => columns.includes(c)),
    ...columns.filter((c) => !prefer.includes(c)).slice(0, 8),
  ].slice(0, 16);

  const sample = rows.slice(0, maxRows).map((row) => {
    const obj: Record<string, YtdCell> = {};
    for (const c of showCols) {
      const i = columns.indexOf(c);
      if (i >= 0) obj[c] = row[i] ?? null;
    }
    return obj;
  });

  const payload: Record<string, unknown> = {
    returned_sample: sample.length,
    columns_shown: showCols,
    rows: sample,
  };
  if (q) payload.summary = summarizeYtdFilter(columns, rows, q);

  return truncateText(JSON.stringify(payload), maxChars);
}
