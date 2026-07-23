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

function plantHay(line: NurserySupplyLine): string {
  return `${line.common ?? ""} ${line.botanical ?? ""}`.toLowerCase();
}

/** True Japanese Boxwood (Buxus M. Japonica) — not Winter Gem / Fatsia / Euonymus. */
function isJapaneseBoxwood(line: NurserySupplyLine): boolean {
  const h = plantHay(line);
  return (
    /boxwood,\s*japanese/.test(h) ||
    /buxus\s*m\.?\s*japonica/.test(h) ||
    (/buxus/.test(h) && /japonica/.test(h) && /boxwood/.test(h))
  );
}

function sizeIs1G(sizeRaw: string): boolean {
  const size = sizeRaw.toLowerCase().replace(/\s+/g, "");
  return (
    size.includes("1g") ||
    size.includes("1gal") ||
    size.includes("#001") ||
    size === "001" ||
    size.includes("1gallon")
  );
}

/** Filter SKU lines; ignore stop-words; normalize N CA / 1 gal / jap boxwood. */
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
    "do",
    "we",
    "then",
  ]);

  const wantsJapaneseBoxwood =
    /\bjap(?:anese)?\s+boxwood\b/.test(raw) ||
    /\bboxwood[,\s]+jap(?:anese)?\b/.test(raw) ||
    /\bbuxus\s+m\.?\s*japonica\b/.test(raw);

  const normalized = raw
    .replace(/\bn\.?\s*ca\b/g, "norcal")
    .replace(/\bs\.?\s*ca\b/g, "socal")
    .replace(/\bnorthern\s+california\b/g, "norcal")
    .replace(/\bsouthern\s+california\b/g, "socal")
    .replace(/\bnocal\b/g, "norcal")
    .replace(/\b1[\s-]?gal(?:lon)?s?\b/g, "1g")
    .replace(/\bjap(?:anese)?\s+boxwood\b/g, " ")
    .replace(/\bboxwood[,\s]+jap(?:anese)?\b/g, " ")
    .replace(/\bjap(?:anese)?\b/g, "japanese");

  const tokens = normalized
    .split(/[\s,/|]+/)
    .map((t) => t.trim())
    .filter((t) => t && !stop.has(t));

  const gradeTokens = tokens.filter((t) =>
    ["a", "b", "c", "ss", "gs", "d", "p"].includes(t),
  );
  const regionTokens = tokens.filter((t) =>
    ["norcal", "socal", "nca", "sca"].includes(t),
  );
  const excludeGrades = new Set<string>();
  if (/\bnot\s+including\b|\bexclud/i.test(raw)) {
    for (const t of ["c", "d", "p"]) {
      if (
        new RegExp(`\\b${t}\\b`, "i").test(raw) ||
        raw.includes(`${t} grade`)
      ) {
        excludeGrades.add(t);
      }
    }
  }

  const otherTokens = tokens.filter(
    (t) =>
      !gradeTokens.includes(t) &&
      !regionTokens.includes(t) &&
      t !== "japanese" &&
      t !== "boxwood" &&
      t !== "buxus" &&
      t !== "japonica",
  );

  // If user said jap boxwood as a phrase, don't also require loose japanese/boxwood tokens
  const wantsBoxwood =
    !wantsJapaneseBoxwood &&
    (tokens.includes("boxwood") || tokens.includes("buxus"));
  const wantsJapaneseAlone =
    !wantsJapaneseBoxwood &&
    !wantsBoxwood &&
    (tokens.includes("japanese") || tokens.includes("japonica"));

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
    const plant = plantHay(line);

    if (excludeGrades.has(grade)) return false;

    if (wantsJapaneseBoxwood && !isJapaneseBoxwood(line)) return false;
    if (wantsBoxwood && !/boxwood|buxus/.test(plant)) return false;
    if (wantsJapaneseAlone && !/japan|japon/.test(plant)) return false;

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
        return sizeIs1G(String(line.size ?? ""));
      }
      if (t === "3g" || t === "3gal" || t === "#003" || t === "003") {
        const size = String(line.size ?? "").toLowerCase().replace(/\s+/g, "");
        return size.includes("3g") || size.includes("#003") || size === "003";
      }
      if (t === "5g" || t === "5gal" || t === "#005" || t === "005") {
        const size = String(line.size ?? "").toLowerCase().replace(/\s+/g, "");
        return size.includes("5g") || size.includes("#005") || size === "005";
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
  ready_dates: string[];
  demand_windows: string[];
};

function emptyCell(): AggCell {
  return {
    graded_on_hand: 0,
    saleable_net: 0,
    available_to_sell: 0,
    farms: [],
    earliest_ready_date: null,
    ready_dates: [],
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
      if (!cell.ready_dates.includes(line.readyDate)) {
        cell.ready_dates.push(line.readyDate);
      }
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
      c.ready_dates.sort();
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

  const comingReady = filtered
    .filter((r) => r.readyDate)
    .sort((a, b) => String(a.readyDate).localeCompare(String(b.readyDate)))
    .slice(0, 40)
    .map((r) => ({
      farm: r.farm,
      region: r.region,
      common: r.common,
      size: r.size,
      grade: r.grade,
      graded_on_hand: r.graded,
      available_to_sell:
        r.available != null ? r.available : Math.max(0, Number(r.saleable) || 0),
      readyDate: r.readyDate,
      demandWindow: r.demandWindow,
    }));

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

  const withReady = filtered.filter((r) => r.readyDate).length;
  const withoutReady = filtered.length - withReady;

  return truncateText(
    JSON.stringify({
      q,
      matched_lines: filtered.length,
      source:
        "Sales Inventory Availability XXTT inventory file (LANDSCAPE_INV_PL) — same workbook users call the inventory file. READY DATE is a column in this file; some lines are blank.",
      field_guide: {
        graded_on_hand:
          "Physical graded inventory on hand from the XXTT inventory file.",
        saleable_net:
          "Net saleable after allocations — can be negative if oversold (NOT Production & Demand BO/CR).",
        available_to_sell: "max(0, saleable_net) — units still free to sell.",
        readyDate:
          "READY DATE from the XXTT inventory file when populated. Null/blank means that line has no ready date yet — other matching lines may still have dates.",
      },
      totals: {
        graded_on_hand: Math.round(totals.graded * 100) / 100,
        saleable_net: Math.round(totals.saleable * 100) / 100,
        available_to_sell: Math.round(totals.available * 100) / 100,
        lines_with_readyDate: withReady,
        lines_missing_readyDate: withoutReady,
      },
      by_region_grade: byRegionGrade,
      coming_ready: comingReady,
      sample_rows: sample,
      answer_hint:
        "Call this the inventory file (XXTT), not a separate price list. For on-hand, lead with graded_on_hand. For 'coming ready', list coming_ready rows with readyDate — never say ready dates are missing from the file if coming_ready is non-empty. Blank readyDate on some lines is normal.",
    }),
    maxChars,
  );
}
