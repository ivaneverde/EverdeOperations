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
  qty: 8,
  revenue: 9,
  lines: 10,
};

const EXPECTED_WIDTH = SALES_BY_ITEM_COLUMNS.length;

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
      return null; // old grain without bill_to — republish required
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

function isKnownCustomerPhrase(phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  return CUSTOMER_FIRST_PHRASES.some(
    (c) => p === c || p.includes(c) || c.includes(p),
  );
}

/** Parse item / customer / channel / year(s) / size from natural-language q=. */
export function parseSalesByItemQuery(q: string): ParsedQuery {
  let rest = q.trim();
  const out: ParsedQuery = { years: [], westCoastLsc: false, tokens: [] };

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
  }

  const sizeM = rest.match(/#\s*(\d{1,2})\b/i);
  if (sizeM) {
    out.size = Number(sizeM[1]);
    rest = rest.replace(sizeM[0], " ");
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
    out.customerPhrase = normalizePhrase(custM[1]);
    rest = rest.replace(custM[0], " ");
  }

  // Quoted phrase → customer/account preference
  const quoted = rest.match(/["“']([^"”']{3,})["”']/);
  if (quoted?.[1]) {
    out.customerPhrase = normalizePhrase(quoted[1]);
    rest = rest.replace(quoted[0], " ");
  }

  const yearStrs = new Set(out.years.map(String));
  out.tokens = normalizePhrase(rest)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t) && !yearStrs.has(t));

  // If no explicit customer phrase but tokens look like a name (3+ words), keep as phrase too
  if (!out.customerPhrase && out.tokens.length >= 2) {
    out.customerPhrase = out.tokens.join(" ");
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
  item: string;
  all: string;
} {
  const bill = String(row[COL.bill_to] ?? "").toLowerCase();
  const channel = String(row[COL.demand_channel] ?? "").toLowerCase();
  const rep = String(row[COL.rep] ?? "").toLowerCase();
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
    item,
    all: `${bill} ${channel} ${rep} ${item}`,
  };
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
        desc.includes(`#0${parsed.size}`);
      if (!sizeOk) continue;
    }

    const fields = fieldHay(row);
    let score = 0;
    let billScore = 0;
    let chScore = 0;
    let repScore = 0;
    let itemScore = 0;

    if (phrase) {
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
      let ok = true;
      for (const t of parsed.tokens) {
        if (!fields.all.includes(t)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      score = 60;
    } else {
      // years / westCoast / size only
      score = 40;
    }

    scored.push({ row, score, billScore, chScore, repScore, itemScore });
  }

  // Customer-first: when Bill To matches (or known alias like Fast Growing Trees),
  // do not mix in Demand Channel rows that share the same label.
  let kept = scored;
  if (phrase) {
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
  const minScore = phrase ? 50 : 0;
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
  field: "bill_to" | "demand_channel" | "rep",
  limit = 12,
): { name: string; score: number }[] {
  const col =
    field === "bill_to"
      ? COL.bill_to
      : field === "demand_channel"
        ? COL.demand_channel
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
          note: "Sales by Item IS loaded — zero matches means the filter did not hit. Do NOT say data is missing.",
          q,
          parsed,
          published_rows: rows.length,
          retry_tips: [
            "Try Bill To / customer name fragments (e.g. 'fast growing trees', 'southwest nursery').",
            "Or Demand Channel (e.g. 'WEST COAST SOUTH', 'SOUTHEAST - TX', 'MIDWEST') — say 'demand channel' if you mean channel not customer.",
            "Or rep last name (e.g. 'mcbride', 'eckert').",
            "Add year 2024/2025/2026 or 'this year'. West Coast LSC = WEST COAST NORTH + SOUTH.",
          ],
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
    note: "bill_to = customer/account (Bill To Name). Fast Growing Trees is a customer (Bill To), not primarily a Demand Channel — lead with by_customer + totals + by_rep. Rep = Everde salesperson. Demand Channel is the sales program/region (e.g. MIDWEST, SOUTHEAST - TX).",
  };

  return truncateText(JSON.stringify(payload, null, 2), maxChars);
}
