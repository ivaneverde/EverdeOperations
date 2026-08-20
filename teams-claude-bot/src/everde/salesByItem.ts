import { gunzipSync } from "zlib";
import { downloadBytesFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  salesByItemRowsGzipPath,
} from "../azure/blobPaths.js";
import { truncateText } from "./compact.js";

export type SalesByItemCell = string | number | boolean | null;
export type SalesByItemRow = SalesByItemCell[];

export const SALES_BY_ITEM_COLUMNS = [
  "year",
  "tree",
  "description",
  "common_name",
  "container",
  "demand_channel",
  "rep",
  "bill_to",
  "ship_to",
  "farm",
  "qty",
  "revenue",
  "lines",
] as const;

const COL = {
  year: 0,
  tree: 1,
  description: 2,
  common_name: 3,
  container: 4,
  demand_channel: 5,
  rep: 6,
  bill_to: 7,
  ship_to: 8,
  farm: 9,
  qty: 10,
  revenue: 11,
  lines: 12,
};

const EXPECTED_WIDTH = SALES_BY_ITEM_COLUMNS.length;

export type SalesByItemRetailerScope = "all" | "hd" | "lowes" | "hd_lowes";

function channelBillHay(row: SalesByItemRow): { ch: string; bill: string } {
  return {
    ch: String(row[COL.demand_channel] ?? "").toUpperCase(),
    bill: String(row[COL.bill_to] ?? "").toUpperCase(),
  };
}

function isHdSalesByItemRow(row: SalesByItemRow): boolean {
  const { ch, bill } = channelBillHay(row);
  return ch.startsWith("HD") || bill.includes("HOME DEPOT");
}

function isLowesSalesByItemRow(row: SalesByItemRow): boolean {
  const { ch, bill } = channelBillHay(row);
  return ch.startsWith("LOWE") || bill.includes("LOWE");
}

/** Restrict compact SBI rows to the bot / view-rights retailer slice. */
export function scopeSalesByItemRows(
  rows: SalesByItemRow[],
  scope: SalesByItemRetailerScope,
): SalesByItemRow[] {
  if (scope === "all") return rows;
  if (scope === "hd") return rows.filter(isHdSalesByItemRow);
  if (scope === "lowes") return rows.filter(isLowesSalesByItemRow);
  return rows.filter((r) => isHdSalesByItemRow(r) || isLowesSalesByItemRow(r));
}

type CacheEntry = {
  rows: SalesByItemRow[];
  loadedAt: number;
};

const g = globalThis as unknown as {
  __everdeSalesByItemCache?: CacheEntry;
};

/** Clear in-memory cache after Blob republish / column grain change. */
export function clearSalesByItemCache(): void {
  delete g.__everdeSalesByItemCache;
}

export async function loadSalesByItemRowsCached(): Promise<SalesByItemRow[] | null> {
  const hit = g.__everdeSalesByItemCache;
  if (hit?.rows?.length) {
    const sample = hit.rows[0];
    if (sample && sample.length >= EXPECTED_WIDTH) return hit.rows;
    clearSalesByItemCache();
  }

  const buf = await downloadBytesFromBlob(
    freightBlobContainer(),
    salesByItemRowsGzipPath(),
  );
  if (!buf) return null;
  try {
    const json = gunzipSync(buf).toString("utf8");
    const rows = JSON.parse(json) as SalesByItemRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (!rows[0] || rows[0].length < EXPECTED_WIDTH) {
      return null; // old grain without farm — republish required
    }
    g.__everdeSalesByItemCache = { rows, loadedAt: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

type ParsedQuery = {
  years: number[];
  size?: number;
  westCoastLsc: boolean;
  /** Everde Tree / item codes (e.g. ELADEF0430) — required exact match when set */
  treeCodes: string[];
  /** Ship-to store number from STORE #6910 / store 6910 */
  storeNbr?: string;
  /** Shipping farm Location org (BNL, GFL, …) */
  farm?: string;
  /** Prefer customer / bill-to / channel phrase match */
  customerPhrase?: string;
  tokens: string[];
};

const STOP = new Set([
  "the",
  "from",
  "and",
  "for",
  "who",
  "sold",
  "bought",
  "buy",
  "channel",
  "item",
  "in",
  "of",
  "a",
  "an",
  "to",
  "with",
  "which",
  "reps",
  "rep",
  "salesperson",
  "material",
  "sales",
  "provide",
  "include",
  "customer",
  "account",
  "purchased",
  "purchase",
  "buying",
  "bought",
  "ytd",
  "year",
  "so",
  "far",
  "this",
  "has",
  "have",
  "what",
  "are",
  "how",
  "much",
  "many",
  "please",
  "show",
  "get",
  "tell",
  "me",
  "about",
  "their",
  "our",
  "vs",
  "versus",
  "history",
  "breakdown",
  "detail",
  "details",
  "by",
  "store",
  "stores",
  "recent",
  "invoiced",
  "invoice",
  "did",
  "were",
  "all",
  "customers",
  "specifically",
]);

function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bill To customers that share a name with a Demand Channel.
 * Meredith (2026-08-13): Fast Growing Trees is the customer name — prefer bill_to.
 */
const CUSTOMER_FIRST_PHRASES = ["fast growing trees"] as const;

/** Location org codes and spoken farm names (Sales by Item `Location` / `Loc`). */
const FARM_NAME_TO_CODE: [string, string][] = [
  ["pauma valley", "PAU"],
  ["huntington beach", "HUN"],
  ["forest grove", "FOR"],
  ["glen flora", "GFL"],
  ["fallbrook", "FAL"],
  ["homestead", "HOM"],
  ["escondido", "ESC"],
  ["winnsboro", "BRA"],
  ["pahokee", "OAS"],
  ["bunnell", "BNL"],
  ["winters", "WIN"],
  ["pauma", "PAU"],
  ["piru", "PIR"],
  ["bnl", "BNL"],
  ["gfl", "GFL"],
];

const FARM_CODES = new Set([
  "BNL",
  "GFL",
  "WIN",
  "MLC",
  "HOM",
  "FOR",
  "FAL",
  "STE",
  "MCR",
  "HUN",
  "PIR",
  "MIR",
  "PAU",
  "BRA",
  "OAS",
  "ESC",
]);

function extractFarm(rest: string): { farm?: string; rest: string } {
  const lower = rest.toLowerCase();
  for (const [name, code] of FARM_NAME_TO_CODE) {
    const idx = lower.indexOf(name);
    if (idx < 0) continue;
    const before = rest.slice(0, idx);
    const after = rest.slice(idx + name.length);
    return { farm: code, rest: `${before} ${after}` };
  }
  const codeAlt = [...FARM_CODES].join("|");
  const prefixed = rest.match(
    new RegExp(`\\b(?:farm|location|org)\\s+(${codeAlt})\\b`, "i"),
  );
  if (prefixed?.[1]) {
    return {
      farm: prefixed[1].toUpperCase(),
      rest: rest.replace(prefixed[0], " "),
    };
  }
  // Bare org codes only when written in caps (avoid "for" → FOR, "win" → WIN)
  const caps = rest.match(new RegExp(`\\b(${codeAlt})\\b`));
  if (caps?.[1] && caps[1] === caps[1].toUpperCase()) {
    return { farm: caps[1], rest: rest.replace(caps[0], " ") };
  }
  return { rest };
}

function isKnownCustomerPhrase(phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  return CUSTOMER_FIRST_PHRASES.some(
    (c) => p === c || p.includes(c) || c.includes(p),
  );
}

/** Everde Tree codes look like ELADEF0430 / DISTBU015 — letters then digits. */
const TREE_CODE_RE = /\b([A-Za-z]{3,}\d{2,4})\b/g;

/** Parse item / customer / channel / year(s) / size from natural-language q=. */
export function parseSalesByItemQuery(q: string): ParsedQuery {
  let rest = q.trim();
  const out: ParsedQuery = {
    years: [],
    westCoastLsc: false,
    treeCodes: [],
    tokens: [],
  };

  const yearMatches = [...rest.matchAll(/\b(20\d{2})\b/g)];
  if (yearMatches.length) {
    const seen = new Set<number>();
    for (const m of yearMatches) {
      const y = Number(m[1]);
      if (!seen.has(y)) {
        seen.add(y);
        out.years.push(y);
      }
      rest = rest.replace(m[0], " ");
    }
  } else if (/\b(?:this\s+year|ytd|year\s+to\s+date)\b/i.test(rest)) {
    out.years.push(new Date().getFullYear());
    rest = rest.replace(/\b(?:this\s+year|ytd|year\s+to\s+date)\b/gi, " ");
  } else {
    // "26 sales history" → 2026 (common shorthand)
    const shortY = rest.match(/\b(2[4-9])\b/);
    if (shortY && /\b(sales|history|ytd|sold|bought)\b/i.test(rest)) {
      out.years.push(2000 + Number(shortY[1]));
      rest = rest.replace(shortY[0], " ");
    }
  }

  // Extract Tree / SKU codes before tokenizing (required matches)
  const codeMatches = [...rest.matchAll(TREE_CODE_RE)];
  if (codeMatches.length) {
    const seen = new Set<string>();
    for (const m of codeMatches) {
      const code = m[1].toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        out.treeCodes.push(code);
      }
      rest = rest.replace(m[0], " ");
    }
  }

  const storeM =
    rest.match(/\bstores?\s*(?:nbr|number|#|:)?\s*(\d{3,4})\b/i) ||
    rest.match(/\bstore\s*#\s*(\d{3,4})\b/i);
  if (storeM?.[1]) {
    out.storeNbr = String(Number(storeM[1]));
    rest = rest.replace(storeM[0], " ");
  }

  const farmed = extractFarm(rest);
  if (farmed.farm) out.farm = farmed.farm;
  rest = farmed.rest;

  const galM = rest.match(/\b(\d{1,2})\s*(?:g|gal|gallon)s?\b/i);
  const hashSizeM = rest.match(/#\s*0*(\d{1,2})\b/i);
  if (galM) {
    out.size = Number(galM[1]);
    rest = rest.replace(galM[0], " ");
  } else if (hashSizeM) {
    out.size = Number(hashSizeM[1]);
    rest = rest.replace(hashSizeM[0], " ");
  }

  const lsc =
    /\bwest\s*coast\s*lsc\b/i.test(rest) ||
    /\bwest\s*coast\s*landscape\b/i.test(rest) ||
    /\blsc\s*west\s*coast\b/i.test(rest);
  if (lsc) {
    out.westCoastLsc = true;
    rest = rest.replace(/\bwest\s*coast\s*(lsc|landscape)\b/gi, " ");
    rest = rest.replace(/\blsc\s*west\s*coast\b/gi, " ");
  }

  const custM = rest.match(
    /\b(?:customer|account|bill\s*to)\s+(.+)$/i,
  );
  if (custM?.[1]) {
    const p = normalizePhrase(custM[1]);
    const meaningful = p
      .split(" ")
      .filter((t) => t.length >= 2 && !STOP.has(t));
    if (meaningful.length) {
      out.customerPhrase = p;
      rest = rest.replace(custM[0], " ");
    }
  }

  // Quoted phrase → customer/account preference
  const quoted = rest.match(/["“']([^"”']{3,})["”']/);
  if (quoted?.[1]) {
    out.customerPhrase = normalizePhrase(quoted[1]);
    rest = rest.replace(quoted[0], " ");
  }

  if (!out.storeNbr) {
    const bareStore = rest.match(/\b(\d{4})\b/);
    if (
      bareStore &&
      /\b(sales|sold|order|orders|ytd|ship|hd|home\s*depot|lowes?|depot|recent|invoic|valley|mission|market|district)\b/i.test(
        q,
      )
    ) {
      out.storeNbr = String(Number(bareStore[1]));
      rest = rest.replace(bareStore[0], " ");
    }
  }

  const yearStrs = new Set(out.years.map(String));
  out.tokens = normalizePhrase(rest)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t) && !yearStrs.has(t));

  // Auto customerPhrase only for account-like asks — never when a Tree code / size
  // item query is present (that was collapsing SKUs into channel-wide book totals).
  if (
    !out.customerPhrase &&
    !out.treeCodes.length &&
    !out.storeNbr &&
    !out.farm &&
    out.tokens.length >= 2 &&
    out.size == null
  ) {
    out.customerPhrase = out.tokens.join(" ");
  }

  if ((out.storeNbr || out.farm) && !out.years.length) {
    out.years.push(new Date().getFullYear());
  }

  return out;
}

function treeSize(tree: string): number | null {
  const m = String(tree).match(/(\d{2,4})$/);
  if (!m) return null;
  const last2 = Number(m[1].slice(-2));
  return Number.isFinite(last2) ? last2 : null;
}

function containerSize(container: string): number | null {
  const m = String(container).replace(/,/g, "").match(/(\d{1,3})/);
  if (!m) return null;
  return Number(m[1]);
}

function fieldHay(row: SalesByItemRow): {
  bill: string;
  channel: string;
  rep: string;
  ship: string;
  farm: string;
  item: string;
  all: string;
} {
  const bill = String(row[COL.bill_to] ?? "").toLowerCase();
  const channel = String(row[COL.demand_channel] ?? "").toLowerCase();
  const rep = String(row[COL.rep] ?? "").toLowerCase();
  const ship = String(row[COL.ship_to] ?? "").toLowerCase();
  const farm = String(row[COL.farm] ?? "").toLowerCase();
  const item = [
    row[COL.tree],
    row[COL.description],
    row[COL.common_name],
    row[COL.container],
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  return {
    bill,
    channel,
    rep,
    ship,
    farm,
    item,
    all: `${bill} ${channel} ${rep} ${ship} ${farm} ${item}`,
  };
}

function shipToMatchesStore(shipTo: string, storeNbr: string): boolean {
  const want = String(Number(storeNbr));
  const digits = String(shipTo).replace(/\D/g, "");
  if (!want || !digits) return false;
  const stripped = String(Number(digits));
  return stripped === want || digits.endsWith(want.padStart(4, "0")) || digits.endsWith(want);
}

function phraseScore(hay: string, phrase: string): number {
  if (!phrase) return 0;
  if (hay.includes(phrase)) return 100;
  const parts = phrase.split(" ").filter(Boolean);
  if (!parts.length) return 0;
  let hit = 0;
  for (const p of parts) {
    if (hay.includes(p)) hit += 1;
  }
  return Math.round((hit / parts.length) * 80);
}

export function filterSalesByItemRows(
  rows: SalesByItemRow[],
  q: string,
): SalesByItemRow[] {
  const parsed = parseSalesByItemQuery(q);
  const phrase = parsed.customerPhrase ?? "";
  const channelIntent = /\bdemand\s*channel\b/i.test(q);
  const treeCodeSet = new Set(parsed.treeCodes.map((c) => c.toUpperCase()));

  type Scored = {
    row: SalesByItemRow;
    score: number;
    billScore: number;
    chScore: number;
    repScore: number;
    itemScore: number;
  };
  const scored: Scored[] = [];

  for (const row of rows) {
    if (parsed.years.length) {
      const y = Number(row[COL.year]);
      if (!parsed.years.includes(y)) continue;
    }
    if (parsed.storeNbr) {
      if (!shipToMatchesStore(String(row[COL.ship_to] ?? ""), parsed.storeNbr)) {
        continue;
      }
    }
    if (parsed.farm) {
      const farm = String(row[COL.farm] ?? "").trim().toUpperCase();
      if (farm !== parsed.farm) continue;
    }
    const tree = String(row[COL.tree] ?? "").toUpperCase();
    if (treeCodeSet.size) {
      if (!treeCodeSet.has(tree)) continue;
    }
    const ch = String(row[COL.demand_channel] ?? "").toUpperCase();
    if (parsed.westCoastLsc) {
      if (!ch.startsWith("WEST COAST") || ch.includes("SITEONE")) continue;
    }
    if (parsed.size != null) {
      const ts = treeSize(String(row[COL.tree] ?? ""));
      const cs = containerSize(String(row[COL.container] ?? ""));
      const desc = String(row[COL.description] ?? "").toUpperCase();
      const sizeOk =
        ts === parsed.size ||
        cs === parsed.size ||
        desc.includes(`#${parsed.size}`) ||
        desc.includes(`#0${parsed.size}`) ||
        desc.includes(`#${String(parsed.size).padStart(3, "0")}`);
      if (!sizeOk) continue;
    }

    const fields = fieldHay(row);
    let score = 0;
    let billScore = 0;
    let chScore = 0;
    let repScore = 0;
    let itemScore = 0;

    if (parsed.storeNbr || parsed.farm) {
      score = 100;
    } else if (treeCodeSet.size) {
      // Exact Tree code already enforced — optional tokens refine further
      score = 100;
      if (parsed.tokens.length) {
        for (const t of parsed.tokens) {
          if (fields.item.includes(t) || fields.rep.includes(t)) score += 5;
        }
      }
    } else if (phrase) {
      billScore = phraseScore(fields.bill, phrase);
      chScore = phraseScore(fields.channel, phrase);
      repScore = phraseScore(fields.rep, phrase);
      itemScore = phraseScore(fields.item, phrase);
      score = Math.max(billScore, chScore, repScore, itemScore);
      // Require a meaningful customer/channel/rep/item hit when phrase present
      if (score < 50) continue;
      // Prefer bill_to (customer) over channel / item word hits
      if (billScore >= 50) score += 40;
      else if (chScore >= 50) score += 15;
      else if (repScore >= 50) score += 25;
    } else if (parsed.tokens.length) {
      // Item / genus / rep tokens: require every token on the row (usually item fields)
      let ok = true;
      let itemHits = 0;
      for (const t of parsed.tokens) {
        if (fields.item.includes(t)) {
          itemHits += 1;
          continue;
        }
        if (fields.rep.includes(t) || fields.bill.includes(t) || fields.channel.includes(t)) {
          continue;
        }
        ok = false;
        break;
      }
      if (!ok) continue;
      // If size/genus style query, prefer item hits (avoid channel-only book)
      if (parsed.size != null && itemHits === 0) continue;
      score = 60 + itemHits * 10;
    } else {
      // years / westCoast / size only — channel book scope (caller must not claim a SKU)
      score = 40;
    }

    scored.push({ row, score, billScore, chScore, repScore, itemScore });
  }

  // Customer-first: when Bill To matches (or known alias like Fast Growing Trees),
  // do not mix in Demand Channel rows that share the same label.
  let kept = scored;
  if (phrase && !treeCodeSet.size && !parsed.storeNbr && !parsed.farm) {
    const billHits = scored.filter((s) => s.billScore >= 50);
    const chHits = scored.filter((s) => s.chScore >= 50);
    const preferCustomer =
      !channelIntent &&
      billHits.length > 0 &&
      (isKnownCustomerPhrase(phrase) ||
        billHits.some((s) => s.billScore >= 80));
    if (preferCustomer) {
      kept = billHits;
    } else if (channelIntent && chHits.length) {
      kept = chHits;
    }
  }

  kept.sort(
    (a, b) =>
      b.score - a.score ||
      Math.abs(Number(b.row[COL.revenue] || 0)) -
        Math.abs(Number(a.row[COL.revenue] || 0)),
  );
  const minScore = phrase && !treeCodeSet.size ? 50 : 0;
  return kept.filter((s) => s.score >= minScore).map((s) => s.row);
}

type NamedRollup = {
  name: string;
  qty: number;
  revenue: number;
  lines: number;
  reps?: string[];
  channels?: string[];
  customers?: string[];
  years?: number[];
};

function rollup(
  rows: SalesByItemRow[],
  keyFn: (row: SalesByItemRow) => string,
  attach: (rec: NamedRollup, row: SalesByItemRow) => void,
): NamedRollup[] {
  const map = new Map<string, NamedRollup>();
  for (const row of rows) {
    const name = keyFn(row) || "(unknown)";
    let rec = map.get(name);
    if (!rec) {
      rec = { name, qty: 0, revenue: 0, lines: 0 };
      map.set(name, rec);
    }
    rec.qty += Number(row[COL.qty] || 0);
    rec.revenue += Number(row[COL.revenue] || 0);
    rec.lines += Number(row[COL.lines] || 0);
    attach(rec, row);
  }
  return [...map.values()].sort(
    (a, b) => Math.abs(b.revenue) - Math.abs(a.revenue),
  );
}

function suggestNames(
  rows: SalesByItemRow[],
  phrase: string,
  field: "bill_to" | "demand_channel" | "rep" | "farm",
  limit = 12,
): { name: string; score: number }[] {
  const col =
    field === "bill_to"
      ? COL.bill_to
      : field === "demand_channel"
        ? COL.demand_channel
        : field === "farm"
          ? COL.farm
          : COL.rep;
  const seen = new Map<string, number>();
  const p = normalizePhrase(phrase);
  for (const row of rows) {
    const name = String(row[col] ?? "").trim();
    if (!name || name === "(unknown)") continue;
    const score = phraseScore(name.toLowerCase(), p);
    if (score < 40) continue;
    const prev = seen.get(name) ?? 0;
    if (score > prev) seen.set(name, score);
  }
  return [...seen.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function detailRow(row: SalesByItemRow) {
  return {
    year: row[COL.year],
    tree: row[COL.tree],
    description: row[COL.description],
    common_name: row[COL.common_name],
    container: row[COL.container],
    demand_channel: row[COL.demand_channel],
    rep: row[COL.rep],
    bill_to: row[COL.bill_to],
    ship_to: row[COL.ship_to],
    farm: row[COL.farm],
    qty: row[COL.qty],
    revenue: row[COL.revenue],
    lines: row[COL.lines],
  };
}

export function formatSalesByItemQuery(
  rows: SalesByItemRow[],
  q: string,
  maxChars: number,
): string {
  const parsed = parseSalesByItemQuery(q);
  const matched = filterSalesByItemRows(rows, q);
  const channelBookOnly =
    !parsed.treeCodes.length &&
    !parsed.customerPhrase &&
    !parsed.storeNbr &&
    !parsed.farm &&
    parsed.size == null &&
    parsed.tokens.length === 0 &&
    (parsed.westCoastLsc || parsed.years.length > 0);

  if (matched.length === 0) {
    const phrase = parsed.customerPhrase || parsed.tokens.join(" ");
    const suggestCustomers = phrase
      ? suggestNames(rows, phrase, "bill_to")
      : [];
    const suggestChannels = phrase
      ? suggestNames(rows, phrase, "demand_channel")
      : [];
    const suggestReps = phrase ? suggestNames(rows, phrase, "rep") : [];
    return truncateText(
      JSON.stringify(
        {
          status: "FILTER_MISS",
          note: "Sales by Item is loaded. Zero rows is a filter miss — answer with the closest published farm/item/year, not that data is missing.",
          q,
          parsed,
          published_rows: rows.length,
          retry_tips: [
            "Farm of origin is Location (BNL = Bunnell, GFL = Glen Flora). Include the farm name or code in q=.",
            "Size: '3G' or '#3' (container #003). Item: genus or Tree code.",
            "Try Bill To / customer name fragments (e.g. 'fast growing trees').",
            "Or store: 'store 6910' / 'STORE #6910' (Ship To Add2).",
            "Add year 2024/2025/2026. West Coast LSC = WEST COAST NORTH + SOUTH.",
          ],
          suggested_farms: suggestNames(
            rows,
            parsed.farm || phrase || "bnl",
            "farm",
          ),
          suggested_customers: suggestCustomers,
          suggested_channels: suggestChannels,
          suggested_reps: suggestReps,
        },
        null,
        2,
      ),
      maxChars,
    );
  }

  const byCustomer = rollup(
    matched,
    (r) => String(r[COL.bill_to] ?? "(unknown)"),
    (rec, row) => {
      if (!rec.reps) rec.reps = [];
      if (!rec.channels) rec.channels = [];
      if (!rec.years) rec.years = [];
      const rep = String(row[COL.rep] ?? "");
      const ch = String(row[COL.demand_channel] ?? "");
      const y = Number(row[COL.year]);
      if (rep && !rec.reps.includes(rep)) rec.reps.push(rep);
      if (ch && !rec.channels.includes(ch)) rec.channels.push(ch);
      if (Number.isFinite(y) && !rec.years.includes(y)) rec.years.push(y);
    },
  );

  const byRep = rollup(
    matched,
    (r) => String(r[COL.rep] ?? "(unassigned)"),
    (rec, row) => {
      if (!rec.channels) rec.channels = [];
      if (!rec.customers) rec.customers = [];
      const ch = String(row[COL.demand_channel] ?? "");
      const bill = String(row[COL.bill_to] ?? "");
      if (ch && !rec.channels.includes(ch)) rec.channels.push(ch);
      if (bill && bill !== "(unknown)" && !rec.customers.includes(bill)) {
        rec.customers.push(bill);
      }
    },
  );

  const byChannel = rollup(
    matched,
    (r) => String(r[COL.demand_channel] ?? "(unknown)"),
    (rec, row) => {
      if (!rec.reps) rec.reps = [];
      const rep = String(row[COL.rep] ?? "");
      if (rep && !rec.reps.includes(rep)) rec.reps.push(rep);
    },
  );

  const byItem = rollup(
    matched,
    (r) =>
      `${r[COL.tree]} | ${r[COL.description]} | ${r[COL.container]}`.trim(),
    () => undefined,
  );

  const byStore = rollup(
    matched,
    (r) => String(r[COL.ship_to] ?? "(unknown)"),
    (rec, row) => {
      if (!rec.reps) rec.reps = [];
      if (!rec.customers) rec.customers = [];
      if (!rec.channels) rec.channels = [];
      const rep = String(row[COL.rep] ?? "");
      const bill = String(row[COL.bill_to] ?? "");
      const ch = String(row[COL.demand_channel] ?? "");
      if (rep && !rec.reps.includes(rep)) rec.reps.push(rep);
      if (bill && bill !== "(unknown)" && !rec.customers.includes(bill)) {
        rec.customers.push(bill);
      }
      if (ch && !rec.channels.includes(ch)) rec.channels.push(ch);
    },
  );

  const byFarm = rollup(
    matched,
    (r) => String(r[COL.farm] ?? "(unknown)"),
    (rec, row) => {
      if (!rec.years) rec.years = [];
      const y = Number(row[COL.year]);
      if (Number.isFinite(y) && !rec.years.includes(y)) rec.years.push(y);
    },
  );

  const byYear = rollup(
    matched,
    (r) => String(r[COL.year] ?? ""),
    () => undefined,
  );

  const totals = matched.reduce(
    (acc, row) => {
      acc.qty += Number(row[COL.qty] || 0);
      acc.revenue += Number(row[COL.revenue] || 0);
      acc.lines += Number(row[COL.lines] || 0);
      return acc;
    },
    { qty: 0, revenue: 0, lines: 0 },
  );

  const payload = {
    q,
    parsed,
    matched_rows: matched.length,
    published_rows: rows.length,
    scope:
      parsed.farm
        ? `farm:${parsed.farm}`
        : parsed.storeNbr
        ? `ship_to_store:${parsed.storeNbr}`
        : parsed.treeCodes.length > 0
        ? `tree_code:${parsed.treeCodes.join(",")}`
        : channelBookOnly
          ? "channel_or_year_book"
          : parsed.customerPhrase
            ? "customer_or_phrase"
            : "filtered",
    answer_style:
      "Lead with invoiced units and revenue. If multiple years, split 2025 vs 2026. When farm is in scope, these totals are THAT farm only — never substitute system-wide. Do not say farm-of-origin is missing. Do not apologize or over-qualify.",
    scope_warning: channelBookOnly
      ? "These totals are the FULL matched channel/year book — NOT a single Tree/SKU. Do not attribute them to an item code the user named unless treeCodes were in parsed and matched."
      : undefined,
    totals: {
      qty: Math.round(totals.qty * 100) / 100,
      revenue: Math.round(totals.revenue * 100) / 100,
      lines: totals.lines,
    },
    by_customer: byCustomer.slice(0, 25).map((c) => ({
      bill_to: c.name,
      qty: Math.round(c.qty * 100) / 100,
      revenue: Math.round(c.revenue * 100) / 100,
      lines: c.lines,
      reps: (c.reps ?? []).slice(0, 12),
      channels: (c.channels ?? []).slice(0, 12),
      years: c.years,
    })),
    by_rep: byRep.slice(0, 25).map((r) => ({
      rep: r.name,
      qty: Math.round(r.qty * 100) / 100,
      revenue: Math.round(r.revenue * 100) / 100,
      lines: r.lines,
      channels: (r.channels ?? []).slice(0, 8),
      top_customers: (r.customers ?? []).slice(0, 8),
    })),
    by_channel: byChannel.slice(0, 15).map((c) => ({
      demand_channel: c.name,
      qty: Math.round(c.qty * 100) / 100,
      revenue: Math.round(c.revenue * 100) / 100,
      lines: c.lines,
      reps: (c.reps ?? []).slice(0, 10),
    })),
    by_farm: byFarm.slice(0, 15).map((f) => ({
      farm: f.name,
      qty: Math.round(f.qty * 100) / 100,
      revenue: Math.round(f.revenue * 100) / 100,
      lines: f.lines,
      years: f.years,
    })),
    by_year: byYear.map((y) => ({
      year: y.name,
      qty: Math.round(y.qty * 100) / 100,
      revenue: Math.round(y.revenue * 100) / 100,
      lines: y.lines,
    })),
    by_store: byStore.slice(0, 15).map((s) => ({
      ship_to: s.name,
      qty: Math.round(s.qty * 100) / 100,
      revenue: Math.round(s.revenue * 100) / 100,
      lines: s.lines,
      reps: (s.reps ?? []).slice(0, 8),
      bill_tos: (s.customers ?? []).slice(0, 8),
      channels: (s.channels ?? []).slice(0, 8),
    })),
    top_items: byItem.slice(0, 20).map((i) => ({
      item: i.name,
      qty: Math.round(i.qty * 100) / 100,
      revenue: Math.round(i.revenue * 100) / 100,
      lines: i.lines,
    })),
    sample_rows: matched
      .slice()
      .sort(
        (a, b) =>
          Math.abs(Number(b[COL.revenue] || 0)) -
          Math.abs(Number(a[COL.revenue] || 0)),
      )
      .slice(0, 25)
      .map(detailRow),
    note: "farm = Location org (shipping farm; BNL = Bunnell). ship_to = Ship To Add2 (STORE #6910). bill_to = customer. 3G = container #003. When the user names a farm, report that farm's invoiced qty/revenue only. q='2025 2026 3G loropetalum Bunnell'.",
  };

  return truncateText(JSON.stringify(payload, null, 2), maxChars);
}
