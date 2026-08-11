/**
 * HD West Coast geography for YTD / field queries.
 *
 * SoCal list confirmed with Jae (field): MKT 12, 47, 48, 196, 29A, 36.
 * Store roster: docs/reference/HD_SO_CAL_AND_MKT_29A_Brian_Parker_Stores.xlsx
 * (both tabs = HD SoCal). 29A = Market 29 districts 325+327 (18 stores).
 */

import { HD_29A_STORE_NBRS, HD_SOCAL_STORE_NBRS } from "./hdSocalStores.js";

export type HdGeoRule = {
  /** 4-digit padded Market Nbr */
  market: string;
  /** If set, only these districts within the market (e.g. 29A). */
  districts?: string[];
  /** Display label for summaries */
  label?: string;
};

function mkt(n: number | string): string {
  const s = String(n).trim();
  if (/^\d+$/.test(s)) return s.padStart(4, "0");
  return s;
}

/** Full-market SoCal (excludes 29A split). */
export const HD_SOCAL_WHOLE_MARKETS = ["12", "47", "48", "196", "36"].map(mkt);

/** Market 29 districts that are SoCal ("29A"). */
export const HD_SOCAL_M29_DISTRICTS = ["325", "327"].map(mkt);

export const HD_SOCAL_STORE_SET = new Set<string>(HD_SOCAL_STORE_NBRS);

/** Jae / WCRO HD Southern California scope (market/district rules for display). */
export const HD_SOCAL_RULES: HdGeoRule[] = [
  ...HD_SOCAL_WHOLE_MARKETS.map((market) => ({ market })),
  {
    market: mkt(29),
    districts: HD_SOCAL_M29_DISTRICTS,
    label: "29A (MKT 29 · D325/D327)",
  },
];

export const HD_SOCAL_LABEL = "HD SoCal (S.CA)";
export const HD_SOCAL_NOTE =
  "HD SoCal = MKT 12, 47, 48, 196, 29A (MKT 29 districts 325+327), 36 — Jae/Brian Parker roster (166 stores). Not only 47/48.";

/** NorCal whole markets commonly in scope (CA + Reno). */
export const HD_NORCAL_WHOLE_MARKETS = ["21", "44", "63"].map(mkt);

/** Market 29 districts that stay NorCal (everything except 325/327). */
export const HD_NORCAL_M29_DISTRICTS = ["20", "30", "51", "172"].map(mkt);

export const HD_NORCAL_RULES: HdGeoRule[] = [
  ...HD_NORCAL_WHOLE_MARKETS.map((market) => ({ market })),
  {
    market: mkt(29),
    districts: HD_NORCAL_M29_DISTRICTS,
    label: "MKT 29 (non-29A districts)",
  },
];

export const HD_NORCAL_LABEL = "HD NorCal (N.CA)";
export const HD_NORCAL_NOTE =
  "HD NorCal includes MKT 21, 44, 63, and Market 29 districts outside 325/327. Reno MKT 63 → N.CA.";

const SOCAL_RE =
  /\b(?:so\s*-?\s*cal(?:ifornia)?|s\.?\s*ca|southern\s+california|south\s+cal(?:ifornia)?)\b/i;
const NORCAL_RE =
  /\b(?:nor\s*-?\s*cal(?:ifornia)?|n\.?\s*ca|northern\s+california|north\s+cal(?:ifornia)?)\b/i;
const M29A_RE = /\b(?:29\s*-?\s*a|mkt\s*29a|market\s*29a)\b/i;

export function detectHdRegionAlias(q: string): {
  rules: HdGeoRule[];
  label: string;
  note: string;
  /** When set, filter YTD rows by this store allowlist (Jae roster). */
  storeAllowlist?: string[];
} | null {
  if (M29A_RE.test(q) && !SOCAL_RE.test(q) && !NORCAL_RE.test(q)) {
    return {
      rules: [
        {
          market: mkt(29),
          districts: HD_SOCAL_M29_DISTRICTS,
          label: "29A",
        },
      ],
      label: "HD 29A",
      note: "29A = Market 29 districts 325 (Bakersfield) + 327 (Fresno) → SoCal (18 stores per Jae).",
      storeAllowlist: [...HD_29A_STORE_NBRS],
    };
  }
  if (SOCAL_RE.test(q)) {
    return {
      rules: HD_SOCAL_RULES,
      label: HD_SOCAL_LABEL,
      note: HD_SOCAL_NOTE,
      storeAllowlist: [...HD_SOCAL_STORE_NBRS],
    };
  }
  if (NORCAL_RE.test(q)) {
    return {
      rules: HD_NORCAL_RULES,
      label: HD_NORCAL_LABEL,
      note: HD_NORCAL_NOTE,
    };
  }
  return null;
}

/** Strip region alias phrases so they are not treated as store-name tokens. */
export function stripHdRegionAliasText(q: string): string {
  return q
    .replace(M29A_RE, " ")
    .replace(SOCAL_RE, " ")
    .replace(NORCAL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rowMatchesHdGeoRules(
  marketRaw: string,
  districtRaw: string,
  rules: HdGeoRule[],
): boolean {
  const market = mkt(marketRaw);
  const district = mkt(districtRaw);
  return rules.some((rule) => {
    if (mkt(rule.market) !== market) return false;
    if (!rule.districts?.length) return true;
    return rule.districts.some((d) => mkt(d) === district);
  });
}

export function describeHdGeoRules(rules: HdGeoRule[]): string[] {
  return rules.map((r) => {
    if (r.districts?.length) {
      return (
        r.label ||
        `MKT ${Number(r.market)} districts ${r.districts
          .map((d) => Number(d))
          .join("+")}`
      );
    }
    return `MKT ${Number(r.market)}`;
  });
}

// Re-export padded store lists for callers that import from this module.
export { HD_29A_STORE_NBRS, HD_SOCAL_STORE_NBRS };
