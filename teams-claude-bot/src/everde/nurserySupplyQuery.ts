import { truncateText } from "./compact.js";

export type NurserySupplyLine = {
  farm?: string;
  region?: string;
  botanical?: string;
  common?: string;
  item?: string;
  size?: string;
  grade?: string;
  saleable?: number;
  graded?: number;
  /** max(0, saleable) — units still available to sell */
  available?: number;
  price?: number;
  demandWindow?: string;
  readyDate?: string | null;
};

function normRegionToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .replace(/northerncalifornia|ncalifornia|norcal|nocal|nca/g, "norcal")
    .replace(/southerncalifornia|scalifornia|socal|sca/g, "socal");
}

function regionMatches(lineRegion: string, needle: string): boolean {
  const a = normRegionToken(lineRegion);
  const b = normRegionToken(needle);
  if (!b) return true;
  return a.includes(b) || b.includes(a);
}

/** Filter SKU lines; ignore stop-words; normalize N CA / 1 gal phrasing. */
export function filterNurserySupplyLines(
  lines: NurserySupplyLine[],
  q: string,
): NurserySupplyLine[] {
  const raw = q.trim().toLowerCase();
  if (!raw) return lines;

  const stop = new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "of",
    "in",
    "for",
    "to",
    "by",
    "with",
    "between",
    "both",
    "how",
    "many",
    "have",
    "i",
    "me",
    "tell",
    "break",
    "out",
    "chat",
    "grade",
    "grades",
    "units",
    "unit",
    "inventory",
    "stock",
    "next",
    "crop",
    "come",
    "comes",
    "ready",
    "when",
    "not",
    "including",
    "exclude",
    "excluding",
  ]);

  const normalized = raw
    .replace(/\bn\.?\s*ca\b/g, "norcal")
    .replace(/\bs\.?\s*ca\b/g, "socal")
    .replace(/\bnorthern\s+california\b/g, "norcal")
    .replace(/\bsouthern\s+california\b/g, "socal")
    .replace(/\bnocal\b/g, "norcal")
    .replace(/\b1[\s-]?gal(?:lon)?s?\b/g, "1g")
    .replace(/\b#?0*1\b(?!\d)/g, "1g")
    .replace(/\bjap(?:anese)?\b/g, "japanese");

  const tokens = normalized
    .split(/[\s,/|]+/)
    .map((t) => t.trim())
    .filter((t) => t && !stop.has(t));

  if (tokens.length === 0) return lines;

  const gradeTokens = tokens.filter((t) =>
    ["a", "b", "c", "ss", "gs", "d", "p"].includes(t),
  );
  const regionTokens = tokens.filter((t) =>
    ["norcal", "socal", "nca", "sca"].includes(t),
  );
  const excludeGrades = new Set<string>();
  // "not including c d or the p grades" → tokens may still have c,d,p after stop-word strip
  if (/\bnot\s+including\b|\bexclud/i.test(raw)) {
    for (const t of ["c", "d", "p", "ss", "gs"]) {
      if (raw.includes(` ${t} `) || raw.endsWith(` ${t}`) || raw.includes(`${t} grade`)) {
        excludeGrades.add(t);
      }
    }
  }

  const otherTokens = tokens.filter(
    (t) => !gradeTokens.includes(t) && !regionTokens.includes(t),
  );

  return lines.filter((line) => {
    const hay = [
      line.farm,
      line.region,
      line.botanical,
      line.common,
      line.item,
      line.size,
      line.grade,
      line.demandWindow,
      line.readyDate,
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" | ");
    const regionHay = normRegionToken(String(line.region ?? ""));
    const grade = String(line.grade ?? "").toLowerCase();

    if (excludeGrades.has(grade)) return false;

    if (gradeTokens.length > 0 && !gradeTokens.some((t) => grade === t)) {
      return false;
    }
    if (
      regionTokens.length > 0 &&
      !regionTokens.some((t) => regionMatches(String(line.region ?? ""), t))
    ) {
      return false;
    }

    return otherTokens.every((t) => {
      if (t === "1g" || t === "1gal" || t === "1gallon" || t === "#001" || t === "001") {
        const size = String(line.size ?? "").toLowerCase().replace(/\s+/g, "");
        return (
          size.includes("1g") ||
          size.includes("1gal") ||
          size.includes("#001") ||
          size === "001" ||
          size.includes("1gallon")
        );
      }
      if (t === "3g" || t === "3gal" || t === "#003" || t === "003") {
        const size = String(line.size ?? "").toLowerCase().replace(/\s+/g, "");
        return size.includes("3g") || size.includes("#003") || size === "003";
      }
      if (t === "boxwood" || t === "japanese" || t === "buxus" || t === "japonica") {
        return (
          hay.includes(t) ||
          hay.includes("boxwood") ||
          hay.includes("buxus") ||
          hay.includes("japon")
        );
      }
      return hay.includes(t) || regionHay.includes(normRegionToken(t));
    });
  });
}

type AggCell = {
  graded_on_hand: number;
  saleable_net: number;
  available_to_sell: number;
  farms: string[];
  earliest_ready_date: string | null;
  demand_windows: string[];
};

function emptyCell(): AggCell {
  return {
    graded_on_hand: 0,
    saleable_net: 0,
    available_to_sell: 0,
    farms: [],
    earliest_ready_date: null,
    demand_windows: [],
  };
}

export function aggregateNurserySupplyDetail(
  lines: NurserySupplyLine[],
): Record<string, Record<string, AggCell>> {
  const out: Record<string, Record<string, AggCell>> = {};
  for (const line of lines) {
    const region = String(line.region ?? "—");
    const grade = String(line.grade ?? "—");
    if (!out[region]) out[region] = {};
    if (!out[region][grade]) out[region][grade] = emptyCell();
    const cell = out[region][grade];
    const graded = Number(line.graded) || 0;
    const saleable = Number(line.saleable) || 0;
    const available =
      line.available != null
        ? Number(line.available) || 0
        : Math.max(0, saleable);
    cell.graded_on_hand += graded;
    cell.saleable_net += saleable;
    cell.available_to_sell += available;
    if (line.farm && !cell.farms.includes(line.farm)) cell.farms.push(line.farm);
    if (line.demandWindow && !cell.demand_windows.includes(line.demandWindow)) {
      cell.demand_windows.push(line.demandWindow);
    }
    if (line.readyDate) {
      if (
        !cell.earliest_ready_date ||
        line.readyDate < cell.earliest_ready_date
      ) {
        cell.earliest_ready_date = line.readyDate;
      }
    }
  }
  for (const region of Object.keys(out)) {
    for (const grade of Object.keys(out[region])) {
      const c = out[region][grade];
      c.graded_on_hand = Math.round(c.graded_on_hand * 100) / 100;
      c.saleable_net = Math.round(c.saleable_net * 100) / 100;
      c.available_to_sell = Math.round(c.available_to_sell * 100) / 100;
    }
  }
  return out;
}

export function formatNurserySupplyQuery(
  lines: NurserySupplyLine[],
  q: string,
  maxChars: number,
): string {
  const filtered = filterNurserySupplyLines(lines, q);
  const byRegionGrade = aggregateNurserySupplyDetail(filtered);
  const sample = filtered.slice(0, 40).map((r) => ({
    farm: r.farm,
    region: r.region,
    common: r.common,
    botanical: r.botanical,
    size: r.size,
    grade: r.grade,
    graded_on_hand: r.graded,
    saleable_net: r.saleable,
    available_to_sell:
      r.available != null ? r.available : Math.max(0, Number(r.saleable) || 0),
    readyDate: r.readyDate ?? null,
    demandWindow: r.demandWindow,
  }));

  const totals = filtered.reduce(
    (acc: { graded: number; saleable: number; available: number }, r) => {
      const saleable = Number(r.saleable) || 0;
      acc.graded += Number(r.graded) || 0;
      acc.saleable += saleable;
      acc.available +=
        r.available != null ? Number(r.available) || 0 : Math.max(0, saleable);
      return acc;
    },
    { graded: 0, saleable: 0, available: 0 },
  );

  return truncateText(
    JSON.stringify({
      q,
      matched_lines: filtered.length,
      field_guide: {
        graded_on_hand:
          "Physical graded inventory on hand from XXTT Sales/Inventory/Price List (active inventory).",
        saleable_net:
          "Net saleable after allocations — can be negative if oversold (NOT Production & Demand BO/CR dollars).",
        available_to_sell: "max(0, saleable_net) — units still free to sell.",
        readyDate: "Next crop / ready date from the same XXTT price-list file when populated.",
      },
      totals: {
        graded_on_hand: Math.round(totals.graded * 100) / 100,
        saleable_net: Math.round(totals.saleable * 100) / 100,
        available_to_sell: Math.round(totals.available * 100) / 100,
      },
      by_region_grade: byRegionGrade,
      sample_rows: sample,
      answer_hint:
        "For 'how many do I have' / active inventory, lead with graded_on_hand (and available_to_sell). Mention oversold only when saleable_net < 0. Do not call this BO/CR — that is Production & Demand.",
    }),
    maxChars,
  );
}
