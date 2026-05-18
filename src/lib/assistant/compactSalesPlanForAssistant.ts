import { buildSalesPlanAssistantFacts } from "@/lib/assistant/salesPlanAssistantFacts";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

const SALES_PLAN_INCLUDE_KEYS = [
  "meta",
  "totals_ye",
  "miss_summary",
  "channel_summary",
  "top_ki_miss",
  "excess_by_ki",
  "ytd_performance",
  "plan_by_ki",
  "miss_by_customer",
  "lift_summary",
] as const;

function slimArray(val: unknown, maxRows: number): unknown {
  return Array.isArray(val) ? val.slice(0, maxRows) : val;
}

export function compactSalesPlanForAssistant(
  raw: string,
  maxChars: number,
): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      assistant_facts: buildSalesPlanAssistantFacts(parsed),
    };

    for (const key of SALES_PLAN_INCLUDE_KEYS) {
      if (key in parsed) {
        const val = parsed[key];
        payload[key] =
          key === "plan_by_ki" || key === "miss_by_customer"
            ? slimArray(val, 25)
            : key === "top_ki_miss" || key === "excess_by_ki"
              ? slimArray(val, 20)
              : val;
      }
    }

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    delete payload.plan_by_ki;
    delete payload.miss_by_customer;
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      assistant_facts: payload.assistant_facts,
      meta: parsed.meta ?? null,
      channel_summary: parsed.channel_summary ?? null,
      top_ki_miss: slimArray(parsed.top_ki_miss, 15),
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
