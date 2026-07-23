import { truncateText } from "./compact.js";
import { NURSERY_GRADE_HIERARCHY } from "./gradeHierarchy.js";

export type NurserySupplyLine = {
  farm?: string;
  region?: string;
  botanical?: string;
  common?: string;
  item?: string;
  size?: string;
  grade?: string;
  category?: string;
  saleable?: number;
  graded?: number;
  available?: number;
  price?: number;
  demandWindow?: string;
  readyDate?: string | null;
};

export type NurseryFilterOptions = {
  /** If set, only these grades (lowercase). */
  includeGrades?: string[] | null;
  /** Grades to drop (lowercase); also drops P* when "p" listed. */
  excludeGrades?: string[] | null;
  /** Only rows with a readyDate. */
  requireReadyDate?: boolean;
  /** Ignore A/B tokens from the query text (used for coming-ready pass). */
  ignoreQueryGradeTokens?: boolean;
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

function gradeExcluded(grade: string, exclude: Set<string>): boolean {
  const g = grade.toLowerCase();
  if (exclude.has(g)) return true;
  // "P grades" → PN, P2N, P3N, P
  if (exclude.has("p") && /^p\d*n?$/.test(g)) return true;
  return false;
}

export type NurseryQueryIntent = {
  wantsComingReady: boolean;
  onHandGrades: string[]; // e.g. ["a","b"]
  excludeGrades: string[]; // e.g. ["c","d","p"]
};

export function parseNurseryQueryIntent(q: string): NurseryQueryIntent {
  const raw = q.trim().toLowerCase();
  const wantsComingReady =
    /\bcoming\s+ready\b/.test(raw) ||
    /\bready\s+date/.test(raw) ||
    /\bwhen\b.*\bready\b/.test(raw) ||
    /\bnext\s+crop\b/.test(raw);

  const onHandGrades: string[] = [];
  // "between A and B grade" / "A and B grade"
  if (/\bbetween\s+a\s+and\s+b\b/.test(raw) || /\ba\s+and\s+b\s+grade/.test(raw)) {
    onHandGrades.push("a", "b");
  } else {
    for (const g of ["a", "b", "ss", "gs", "c", "d"]) {
      if (new RegExp(`\\bgrade\\s+${g}\\b|\\b${g}\\s+grade\\b`, "i").test(raw)) {
        onHandGrades.push(g);
      }
    }
  }

  const excludeGrades: string[] = [];
  if (/\bnot\s+including\b|\bexclud/i.test(raw)) {
    for (const t of ["c", "d", "p"]) {
      if (new RegExp(`\\b${t}\\b`, "i").test(raw)) excludeGrades.push(t);
    }
  }

  return { wantsComingReady, onHandGrades, excludeGrades };
}

/** Filter SKU lines; ignore stop-words; normalize N CA / 1 gal / jap boxwood. */
export function filterNurserySupplyLines(
  lines: NurserySupplyLine[],
  q: string,
  options: NurseryFilterOptions = {},
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
    "these",
    "that",
    "ids",
    "id",
    "item",
    "items",
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

  const gradeTokens = options.ignoreQueryGradeTokens
    ? []
    : tokens.filter((t) =>
        ["a", "b", "c", "ss", "gs", "d", "p", "sn", "gn", "pn"].includes(t),
      );
  const regionTokens = tokens.filter((t) =>
    ["norcal", "socal", "nca", "sca"].includes(t),
  );

  const exclude = new Set(
    (options.excludeGrades ?? []).map((g) => g.toLowerCase()),
  );
  if (!options.ignoreQueryGradeTokens && /\bnot\s+including\b|\bexclud/i.test(raw)) {
    for (const t of ["c", "d", "p"]) {
      if (new RegExp(`\\b${t}\\b`, "i").test(raw)) exclude.add(t);
    }
  }

  const include =
    options.includeGrades?.map((g) => g.toLowerCase()) ??
    (gradeTokens.length ? gradeTokens : null);

  const otherTokens = tokens.filter(
    (t) =>
      !gradeTokens.includes(t) &&
      !regionTokens.includes(t) &&
      t !== "japanese" &&
      t !== "boxwood" &&
      t !== "buxus" &&
      t !== "japonica",
  );

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

    if (gradeExcluded(grade, exclude)) return false;
    if (include && include.length > 0 && !include.includes(grade)) return false;
    if (options.requireReadyDate && !line.readyDate) return false;

    if (wantsJapaneseBoxwood && !isJapaneseBoxwood(line)) return false;
    if (wantsBoxwood && !/boxwood|buxus/.test(plant)) return false;
    if (wantsJapaneseAlone && !/japan|japon/.test(plant)) return false;

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
  item_ids: string[];
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
    item_ids: [],
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
    if (line.item && !cell.item_ids.includes(line.item)) {
      cell.item_ids.push(line.item);
    }
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

function mapRows(lines: NurserySupplyLine[]) {
  return lines.map((r) => ({
    farm: r.farm,
    region: r.region,
    common: r.common,
    botanical: r.botanical,
    item_id: r.item,
    size: r.size,
    grade: r.grade,
    category: r.category,
    graded_on_hand: r.graded,
    saleable_net: r.saleable,
    available_to_sell:
      r.available != null ? r.available : Math.max(0, Number(r.saleable) || 0),
    readyDate: r.readyDate ?? null,
    demandWindow: r.demandWindow,
  }));
}

export function formatNurserySupplyQuery(
  lines: NurserySupplyLine[],
  q: string,
  maxChars: number,
): string {
  const intent = parseNurseryQueryIntent(q);

  // Base plant/region/size match without locking to A/B for the whole query
  const base = filterNurserySupplyLines(lines, q, {
    ignoreQueryGradeTokens: true,
    excludeGrades: intent.excludeGrades,
  });

  const onHandGrades =
    intent.onHandGrades.length > 0 ? intent.onHandGrades : null;
  const onHand = filterNurserySupplyLines(lines, q, {
    includeGrades: onHandGrades,
    excludeGrades: intent.excludeGrades,
    ignoreQueryGradeTokens: Boolean(onHandGrades),
  });

  // Coming ready: same plant/geo/size, exclude C/D/P*, INCLUDE SS pipeline grades
  const comingReady = filterNurserySupplyLines(lines, q, {
    ignoreQueryGradeTokens: true,
    excludeGrades:
      intent.excludeGrades.length > 0
        ? intent.excludeGrades
        : intent.wantsComingReady
          ? ["c", "d", "p"]
          : [],
    requireReadyDate: true,
  }).sort((a, b) => String(a.readyDate).localeCompare(String(b.readyDate)));

  let onHandGraded = 0;
  let onHandSaleable = 0;
  let onHandAvailable = 0;
  for (const r of onHand) {
    onHandGraded += Number(r.graded) || 0;
    const saleable = Number(r.saleable) || 0;
    onHandSaleable += saleable;
    onHandAvailable +=
      r.available != null ? Number(r.available) || 0 : Math.max(0, saleable);
  }

  let comingReadyUnits = 0;
  for (const r of comingReady) {
    comingReadyUnits += Number(r.graded) || 0;
  }

  return truncateText(
    JSON.stringify({
      q,
      intent: {
        ...intent,
        note: intent.wantsComingReady
          ? "On-hand uses A/B when requested; coming_ready includes SS (and other non-excluded pipeline grades) with READY DATE — SS is on the path to A/B."
          : "Single filter pass.",
      },
      grade_hierarchy_brief: {
        top: NURSERY_GRADE_HIERARCHY.top_shippable,
        pipeline_includes_ss: true,
        ss: NURSERY_GRADE_HIERARCHY.definitions.SS,
      },
      source:
        "XXTT inventory file (Sales Inventory Availability LANDSCAPE_INV_PL). READY DATE is a column in this file.",
      on_hand: {
        grades: onHandGrades ?? "all matched",
        matched_lines: onHand.length,
        totals: {
          graded_on_hand: Math.round(onHandGraded * 100) / 100,
          saleable_net: Math.round(onHandSaleable * 100) / 100,
          available_to_sell: Math.round(onHandAvailable * 100) / 100,
        },
        by_region_grade: aggregateNurserySupplyDetail(onHand),
        rows: mapRows(onHand).slice(0, 40),
      },
      coming_ready: {
        matched_lines: comingReady.length,
        graded_on_hand_total: Math.round(comingReadyUnits * 100) / 100,
        excludes: intent.excludeGrades.length
          ? intent.excludeGrades
          : intent.wantsComingReady
            ? ["c", "d", "p*"]
            : [],
        includes_note:
          "Includes SS (Sales/Shippable — young crop moving toward A) and other non-excluded grades that have READY DATE populated.",
        by_region_grade: aggregateNurserySupplyDetail(comingReady),
        rows: mapRows(comingReady).slice(0, 40),
      },
      base_match_lines: base.length,
      answer_hint:
        "1) Report on_hand A/B graded counts. 2) Separately report coming_ready — MUST include SS rows with readyDate (e.g. WIN SS Sep 2026). Do not say no ready dates if coming_ready.rows is non-empty. Call this the inventory file. Item ID = ITEM column.",
    }),
    maxChars,
  );
}
