import { truncateForContext } from "@/lib/assistant/truncateForContext";

const SALES_PLAN_INCLUDE_PATTERNS = [
  /^meta$/i,
  /summary/i,
  /kpi/i,
  /channel/i,
  /farm/i,
  /plan/i,
  /coverage/i,
  /excess/i,
  /key.?item/i,
  /overview/i,
];

function pickSalesPlanKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SALES_PLAN_INCLUDE_PATTERNS.some((re) => re.test(key))) {
      out[key] = val;
    }
  }
  return Object.keys(out).length > 0 ? out : { ...obj };
}

export function compactSalesPlanForAssistant(
  raw: string,
  maxChars: number,
): string {
  if (raw.length <= maxChars) return raw;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const picked = pickSalesPlanKeys(parsed);
      const json = JSON.stringify({
        _note: "Sales plan JSON compacted for assistant; prefer summary/KPI sections.",
        ...picked,
      });
      if (json.length <= maxChars) return json;
    }
  } catch {
    /* truncate */
  }

  return truncateForContext(raw, maxChars);
}
