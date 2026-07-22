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
  price?: number;
  demandWindow?: string;
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
    ["a", "b", "c", "ss", "gs"].includes(t),
  );
  const regionTokens = tokens.filter((t) =>
    ["norcal", "socal", "nca", "sca"].includes(t),
  );
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
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" | ");
    const regionHay = normRegionToken(String(line.region ?? ""));
    const grade = String(line.grade ?? "").toLowerCase();

    if (
      gradeTokens.length > 0 &&
      !gradeTokens.some((t) => grade === t)
    ) {
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

export function aggregateNurserySupplyByRegionGrade(
  lines: NurserySupplyLine[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const line of lines) {
    const region = String(line.region ?? "—");
    const grade = String(line.grade ?? "—");
    if (!out[region]) out[region] = {};
    out[region][grade] =
      (out[region][grade] || 0) + (Number(line.saleable) || 0);
  }
  return out;
}

export function formatNurserySupplyQuery(
  lines: NurserySupplyLine[],
  q: string,
  maxChars: number,
): string {
  const filtered = filterNurserySupplyLines(lines, q);
  const byRegionGrade = aggregateNurserySupplyByRegionGrade(filtered);
  const sample = filtered.slice(0, 40).map((r) => ({
    farm: r.farm,
    region: r.region,
    common: r.common,
    botanical: r.botanical,
    size: r.size,
    grade: r.grade,
    saleable: r.saleable,
    item: r.item,
  }));
  const totalSaleable = filtered.reduce(
    (s, r) => s + (Number(r.saleable) || 0),
    0,
  );
  return truncateText(
    JSON.stringify({
      q,
      matched_lines: filtered.length,
      total_saleable: Math.round(totalSaleable * 100) / 100,
      by_region_grade: byRegionGrade,
      sample_rows: sample,
    }),
    maxChars,
  );
}
