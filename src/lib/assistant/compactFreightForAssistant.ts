import { buildFreightAssistantFacts } from "@/lib/assistant/freightAssistantFacts";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

/** Keys that answer freight / 3P / carrier questions (avoid huge monthly/site tables). */
const FREIGHT_INCLUDE_KEYS = [
  "meta",
  "company_kpis",
  "tp_by_year",
  "tp_region",
  "top_carriers",
  "top_lanes",
  "region_kpis",
] as const;

function slimTopCarriers(
  topCarriers: unknown,
  maxYears: number,
  maxPerYear: number,
): unknown {
  if (!topCarriers || typeof topCarriers !== "object") return topCarriers;
  const years = Object.keys(topCarriers as Record<string, unknown>).sort(
    (a, b) => Number(b) - Number(a),
  );
  const out: Record<string, unknown> = {};
  for (const year of years.slice(0, maxYears)) {
    const rows = (topCarriers as Record<string, unknown[]>)[year];
    if (Array.isArray(rows)) {
      out[year] = rows.slice(0, maxPerYear);
    }
  }
  return out;
}

export function compactFreightForAssistant(
  raw: string,
  maxChars: number,
): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const facts = buildFreightAssistantFacts(parsed);

    const payload: Record<string, unknown> = {
      assistant_facts: facts,
    };

    for (const key of FREIGHT_INCLUDE_KEYS) {
      if (key in parsed) {
        payload[key] =
          key === "top_carriers"
            ? slimTopCarriers(parsed[key], 3, 15)
            : parsed[key];
      }
    }

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    payload.top_lanes = slimTopCarriers(parsed.top_lanes, 1, 8);
    delete payload.region_kpis;
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    payload.top_carriers = slimTopCarriers(parsed.top_carriers, 2, 12);
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      assistant_facts: facts,
      top_carriers: slimTopCarriers(parsed.top_carriers, 2, 15),
      meta: parsed.meta ?? null,
      _truncated:
        "Additional freight sections omitted for token limit; use assistant_facts and top_carriers.",
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
