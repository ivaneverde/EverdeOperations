/**
 * On-demand weather overlay for store fulfillment questions.
 * Region-proxied (14 cities), not store microclimate.
 * Verdicts are advisory context over published forecast — not ship orders.
 */

import {
  HD_NORCAL_WHOLE_MARKETS,
  HD_SOCAL_STORE_SET,
  HD_SOCAL_WHOLE_MARKETS,
  HD_SOCAL_M29_DISTRICTS,
} from "./hdGeography.js";
import { padHdCode } from "./ytdFollowingWeek.js";

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}…[truncated]`;
}

export type FulfillmentRetailer = "hd" | "lowes";

type CityForecast = {
  region?: string;
  lat?: number;
  lon?: number;
  forecast?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weathercode?: number[];
  };
};

type DayFlag = {
  date: string;
  high_f: number | null;
  low_f: number | null;
  precip_in: number | null;
  weathercode: number | null;
  wet: boolean;
  storm: boolean;
  freeze: boolean;
  near_freeze: boolean;
};

export type WeatherRegionKey =
  | "N. California"
  | "S. California"
  | "N. Texas"
  | "S. Texas"
  | "Florida"
  | "Colorado"
  | "Unknown";

const PRECIP_WET = 0.35;
const PRECIP_STORM = 0.5;
const STORM_CODES = new Set([95, 96, 99]);
const FREEZE_F = 32;
const NEAR_FREEZE_F = 36;

/** Map weather.forecast city.region strings → our keys. */
function normalizeCityRegion(raw: string): WeatherRegionKey | null {
  const s = raw.trim().toLowerCase();
  if (s.includes("n. california") || s === "n.ca" || s.includes("northern california")) {
    return "N. California";
  }
  if (s.includes("s. california") || s === "s.ca" || s.includes("southern california")) {
    return "S. California";
  }
  if (s.includes("n. texas") || s.includes("north texas") || s === "dallas") {
    return "N. Texas";
  }
  if (
    s.includes("s. texas") ||
    s.includes("south texas") ||
    s.includes("houston") ||
    s.includes("austin")
  ) {
    return "S. Texas";
  }
  if (s.includes("florida") || s === "fl") return "Florida";
  if (s.includes("colorado") || s === "co") return "Colorado";
  return null;
}

export function padStoreNbr(raw: string): string {
  const s = String(raw ?? "").trim().replace(/^#/, "");
  if (/^\d+$/.test(s) && s.length <= 4) return s.padStart(4, "0");
  return s;
}

/** Infer weather region from HD market / SoCal roster / text hints. */
export function weatherRegionForHd(opts: {
  store?: string;
  market?: string;
  district?: string;
  hint?: string;
}): { region: WeatherRegionKey; basis: string } {
  const hint = String(opts.hint ?? "").toLowerCase();
  if (/\b(?:so\s*-?\s*cal|s\.?\s*ca|southern\s+california)\b/i.test(hint)) {
    return { region: "S. California", basis: "query hint SoCal" };
  }
  if (/\b(?:nor\s*-?\s*cal|n\.?\s*ca|northern\s+california)\b/i.test(hint)) {
    return { region: "N. California", basis: "query hint NorCal" };
  }
  if (/\b(?:texas|dallas|houston|austin)\b/i.test(hint)) {
    return {
      region: /\bhouston|austin|s\.?\s*tx|south\s+texas\b/i.test(hint)
        ? "S. Texas"
        : "N. Texas",
      basis: "query hint Texas",
    };
  }
  if (/\b(?:florida|orlando|tampa|miami|jacksonville)\b/i.test(hint)) {
    return { region: "Florida", basis: "query hint Florida" };
  }
  if (/\b(?:colorado|denver)\b/i.test(hint)) {
    return { region: "Colorado", basis: "query hint Colorado" };
  }

  const store = opts.store ? padStoreNbr(opts.store) : "";
  if (store && HD_SOCAL_STORE_SET.has(store)) {
    return {
      region: "S. California",
      basis: `HD store ${store} on Jae SoCal roster`,
    };
  }

  const market = opts.market ? padHdCode(opts.market) : "";
  const district = opts.district ? padHdCode(opts.district) : "";
  if (market && HD_SOCAL_WHOLE_MARKETS.includes(market)) {
    return { region: "S. California", basis: `HD market ${market}` };
  }
  if (
    market === "0029" &&
    district &&
    HD_SOCAL_M29_DISTRICTS.includes(district)
  ) {
    return {
      region: "S. California",
      basis: `HD market 29 district ${district} (29A)`,
    };
  }
  if (market && HD_NORCAL_WHOLE_MARKETS.includes(market)) {
    return { region: "N. California", basis: `HD market ${market}` };
  }
  if (market === "0029") {
    return {
      region: "N. California",
      basis: "HD market 29 (non-29A assumed NorCal without district)",
    };
  }
  // Common TX / FL / AZ HD markets (best-effort)
  if (["0015", "0016", "0056", "0064"].includes(market)) {
    return { region: "N. Texas", basis: `HD market ${market} (TX proxy)` };
  }
  if (["0007", "0014"].includes(market)) {
    return { region: "Florida", basis: `HD market ${market} (FL proxy)` };
  }

  return {
    region: "S. California",
    basis: store
      ? `default S. California (store ${store} not on NorCal list)`
      : "default S. California (insufficient geo)",
  };
}

export function weatherRegionForLowes(opts: {
  subregion?: string;
  hint?: string;
}): { region: WeatherRegionKey; basis: string } {
  const s = `${opts.subregion ?? ""} ${opts.hint ?? ""}`.toUpperCase();
  if (/\bNOR\s*CAL|N\.?\s*CA|NORTH\b/.test(s) && /CAL|CA/.test(s)) {
    return { region: "N. California", basis: "Lowe's NorCal / N.CA hint" };
  }
  if (/\bSO\s*CAL|S\.?\s*CA|SOUTH\b/.test(s) && /CAL|CA|AZ|NV|NM|UT/.test(s)) {
    return { region: "S. California", basis: "Lowe's SoCal / S.CA hint" };
  }
  if (/\bTX|TEXAS|DALLAS|HOUSTON\b/.test(s)) {
    return {
      region: /\bHOUSTON|AUSTIN|S\.?\s*TX\b/.test(s) ? "S. Texas" : "N. Texas",
      basis: "Lowe's Texas hint",
    };
  }
  if (/\bFL|FLORIDA\b/.test(s)) {
    return { region: "Florida", basis: "Lowe's Florida hint" };
  }
  return {
    region: "S. California",
    basis: "default S. California (Lowe's West Coast proxy)",
  };
}

function citiesForRegion(
  forecast: Record<string, CityForecast>,
  region: WeatherRegionKey,
): string[] {
  const out: string[] = [];
  for (const [name, city] of Object.entries(forecast)) {
    const r = normalizeCityRegion(String(city.region ?? ""));
    if (r === region) out.push(name);
  }
  return out.sort();
}

function dayFlags(city: CityForecast, horizonDays: number): DayFlag[] {
  const f = city.forecast ?? {};
  const times = f.time ?? [];
  const highs = f.temperature_2m_max ?? [];
  const lows = f.temperature_2m_min ?? [];
  const precip = f.precipitation_sum ?? [];
  const codes = f.weathercode ?? [];
  const n = Math.min(horizonDays, times.length);
  const out: DayFlag[] = [];
  for (let i = 0; i < n; i++) {
    const p = precip[i] != null ? Number(precip[i]) : null;
    const lo = lows[i] != null ? Number(lows[i]) : null;
    const code = codes[i] != null ? Number(codes[i]) : null;
    const wet = p != null && p >= PRECIP_WET;
    const storm =
      (p != null && p >= PRECIP_STORM) || (code != null && STORM_CODES.has(code));
    const freeze = lo != null && lo <= FREEZE_F;
    const near_freeze = lo != null && lo > FREEZE_F && lo <= NEAR_FREEZE_F;
    out.push({
      date: String(times[i]),
      high_f: highs[i] != null ? Number(highs[i]) : null,
      low_f: lo,
      precip_in: p,
      weathercode: code,
      wet,
      storm,
      freeze,
      near_freeze,
    });
  }
  return out;
}

function mergeDays(cityDays: DayFlag[][]): DayFlag[] {
  if (!cityDays.length) return [];
  const byDate = new Map<string, DayFlag>();
  for (const days of cityDays) {
    for (const d of days) {
      const prev = byDate.get(d.date);
      if (!prev) {
        byDate.set(d.date, { ...d });
        continue;
      }
      prev.wet = prev.wet || d.wet;
      prev.storm = prev.storm || d.storm;
      prev.freeze = prev.freeze || d.freeze;
      prev.near_freeze = prev.near_freeze || d.near_freeze;
      if (d.precip_in != null) {
        prev.precip_in =
          prev.precip_in == null
            ? d.precip_in
            : Math.max(prev.precip_in, d.precip_in);
      }
      if (d.low_f != null) {
        prev.low_f =
          prev.low_f == null ? d.low_f : Math.min(prev.low_f, d.low_f);
      }
      if (d.high_f != null) {
        prev.high_f =
          prev.high_f == null ? d.high_f : Math.max(prev.high_f, d.high_f);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type FulfillmentWeatherVerdict =
  | "proceed"
  | "caution"
  | "hold_outdoor_sensitive";

function verdictFromDays(days: DayFlag[]): {
  verdict: FulfillmentWeatherVerdict;
  reasons: string[];
} {
  const reasons: string[] = [];
  const near = days.slice(0, 4); // next ~4 days matter most for "next week" loads
  const freezeDays = near.filter((d) => d.freeze);
  const nearFreezeDays = near.filter((d) => d.near_freeze);
  const stormDays = near.filter((d) => d.storm);
  const wetDays = near.filter((d) => d.wet);

  if (freezeDays.length) {
    reasons.push(
      `Hard freeze risk (${freezeDays.map((d) => d.date).join(", ")}): lows ≤ ${FREEZE_F}°F — icing / quality damage risk for outdoor plants in transit or on the pad.`,
    );
    return { verdict: "hold_outdoor_sensitive", reasons };
  }
  if (stormDays.length) {
    reasons.push(
      `Heavy rain / storm codes (${stormDays.map((d) => d.date).join(", ")}): outdoor loads may sit damaged or unsalable.`,
    );
    return { verdict: "hold_outdoor_sensitive", reasons };
  }
  if (nearFreezeDays.length || wetDays.length >= 2) {
    if (nearFreezeDays.length) {
      reasons.push(
        `Near-freeze nights (${nearFreezeDays.map((d) => d.date).join(", ")}): lows ≤ ${NEAR_FREEZE_F}°F — protect tender / outdoor-sensitive material.`,
      );
    }
    if (wetDays.length) {
      reasons.push(
        `Wet days (${wetDays.map((d) => d.date).join(", ")}): ≥ ${PRECIP_WET}" precip — outdoor fulfillment less beneficial.`,
      );
    }
    return { verdict: "caution", reasons };
  }
  reasons.push(
    "No hard freeze / storm flags in the next few forecast days for this weather region (city proxy).",
  );
  return { verdict: "proceed", reasons };
}

/** Compact real weather JSON (weather.forecast + light crosswalk). */
export function compactWeatherDashboardPayload(
  raw: string,
  maxChars: number,
): string {
  try {
    const p = JSON.parse(raw) as {
      weather?: {
        fetched_date?: string;
        today?: string;
        iso_week?: number;
        iso_year?: number;
        forecast?: Record<string, CityForecast>;
      };
      crosswalk_meta?: unknown;
      crosswalk_rows?: unknown[];
      meta?: unknown;
      headline?: unknown;
      regions?: unknown;
      alerts?: unknown;
      summary?: unknown;
    };

    // Legacy / alternate shapes
    if (!p.weather?.forecast && (p.regions || p.summary || p.headline)) {
      return truncateText(
        JSON.stringify({
          meta: p.meta ?? null,
          headline: p.headline ?? null,
          regions: p.regions ?? null,
          alerts: p.alerts ?? null,
          summary: p.summary ?? null,
        }),
        maxChars,
      );
    }

    const forecast = p.weather?.forecast ?? {};
    const cities = Object.entries(forecast).map(([name, city]) => {
      const days = dayFlags(city, 7);
      return {
        city: name,
        region: city.region ?? null,
        days: days.map((d) => ({
          date: d.date,
          high_f: d.high_f,
          low_f: d.low_f,
          precip_in: d.precip_in,
          wet: d.wet,
          storm: d.storm,
          freeze: d.freeze,
          near_freeze: d.near_freeze,
        })),
      };
    });

    const rows = Array.isArray(p.crosswalk_rows) ? p.crosswalk_rows : [];
    const recentCrosswalk = rows.slice(-20);

    const payload = {
      as_of: p.weather?.fetched_date ?? p.weather?.today ?? null,
      iso_week: p.weather?.iso_week ?? null,
      iso_year: p.weather?.iso_year ?? null,
      cities,
      crosswalk_meta: p.crosswalk_meta ?? null,
      crosswalk_recent: recentCrosswalk,
      note: "Regional city forecasts (Open-Meteo). Not store-level microclimate. Use get_store_fulfillment_weather when the user asks to take weather into account for store fulfillment.",
    };
    return truncateText(JSON.stringify(payload), maxChars);
  } catch {
    return truncateText(raw, maxChars);
  }
}

export function assessStoreFulfillmentWeather(
  rawWeatherJson: string,
  opts: {
    retailer: FulfillmentRetailer;
    store?: string;
    market?: string;
    district?: string;
    subregion?: string;
    hint?: string;
    horizon_days?: number;
  },
  maxChars: number,
): string {
  let parsed: {
    weather?: {
      fetched_date?: string;
      today?: string;
      forecast?: Record<string, CityForecast>;
    };
  };
  try {
    parsed = JSON.parse(rawWeatherJson) as typeof parsed;
  } catch {
    return "Weather JSON could not be parsed.";
  }

  const forecast = parsed.weather?.forecast ?? {};
  if (!Object.keys(forecast).length) {
    return "Weather forecast cities not present in Blob snapshot — refresh weather publish.";
  }

  const geo =
    opts.retailer === "lowes"
      ? weatherRegionForLowes({
          subregion: opts.subregion,
          hint: opts.hint,
        })
      : weatherRegionForHd({
          store: opts.store,
          market: opts.market,
          district: opts.district,
          hint: opts.hint,
        });

  const cityNames = citiesForRegion(forecast, geo.region);
  const horizon = Math.max(3, Math.min(10, opts.horizon_days ?? 7));
  const perCity = cityNames.map((name) => {
    const city = forecast[name]!;
    const days = dayFlags(city, horizon);
    return { city: name, days };
  });
  const merged = mergeDays(perCity.map((c) => c.days));
  const { verdict, reasons } = verdictFromDays(merged);

  const storePad = opts.store ? padStoreNbr(opts.store) : null;
  const payload = {
    tool: "get_store_fulfillment_weather",
    retailer: opts.retailer,
    store: storePad,
    market: opts.market ? padHdCode(opts.market) : null,
    weather_region: geo.region,
    region_basis: geo.basis,
    as_of: parsed.weather?.fetched_date ?? parsed.weather?.today ?? null,
    cities_used: cityNames,
    horizon_days: horizon,
    daily_region_flags: merged,
    weather_verdict: verdict,
    weather_reasons: reasons,
    guidance: {
      proceed:
        "Weather does not show freeze/storm blockers — still base item lists on published WCRO top pools / NN for the market, plus store YTD on-hand. Label as weather-informed, not a Write Order.",
      caution:
        "Weather caution — prefer hardy / covered-pad friendly published pools; avoid pushing tender outdoor-only sets into wet/near-freeze windows. Cite WCRO pools; do not invent SKUs.",
      hold_outdoor_sensitive:
        "Weather argues against sending outdoor-sensitive material into this window (storm and/or freeze). Say shipping those loads is NOT recommended for weather. Still show published WCRO demand so the rep sees what the plan wanted — do not invent alternate SKUs.",
    }[verdict],
    next_tools: [
      opts.retailer === "lowes"
        ? "get_lowes_ytd_following_week focus=query q=store …"
        : `get_hd_ytd_following_week focus=query q=store ${storePad ?? ""}`,
      "get_wcro_dashboard (top_pools_by_market for the store's market)",
    ],
    caveats: [
      "Weather is a city/region proxy — not the store's exact zip microclimate.",
      "Do NOT invent store×SKU Write Orders. Item suggestions must come from published WCRO / YTD.",
      "Only apply this weather overlay when the user asked to take weather into account (or asked if weather makes shipping recommended).",
      "If as_of is stale, say the forecast snapshot date clearly.",
    ],
  };

  return truncateText(JSON.stringify(payload, null, 2), maxChars);
}
