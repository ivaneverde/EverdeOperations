import { truncateForContext } from "@/lib/assistant/truncateForContext";

function slimRows(val: unknown, max: number): unknown {
  return Array.isArray(val) ? val.slice(0, max) : val;
}

export function compactRetailForAssistant(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const kn = (parsed.key_numbers ?? {}) as Record<string, unknown>;
    const meta = parsed.meta ?? null;

    const combined = kn.combined as Record<string, number> | undefined;
    const facts = combined
      ? {
          week: (meta as { week?: number })?.week,
          refresh: (meta as { refresh_date?: string })?.refresh_date,
          combined_net_need_retail: combined.net_need_retail,
          combined_ship_now_retail: combined.ship_now_retail,
          combined_plan_at_risk_retail: combined.plan_at_risk_retail,
          hd_net_need_retail: (kn.hd as Record<string, number>)?.net_need_retail,
          lowes_net_need_retail: (kn.lowes as Record<string, number>)
            ?.net_need_retail,
          region_crosstab: kn.region_crosstab ?? null,
          action_buckets: kn.action_buckets ?? null,
        }
      : undefined;

    if (maxChars <= 9_000 && facts) {
      const slim = {
        assistant_facts: facts,
        meta,
        top30_ship_now: slimRows(parsed.top30_ship_now, 6),
        top20_stores: slimRows(parsed.top20_stores, 5),
      };
      const json = JSON.stringify(slim);
      if (json.length <= maxChars) return json;
    }

    const payload: Record<string, unknown> = {
      meta,
      key_numbers: {
        combined: kn.combined ?? null,
        hd: kn.hd ?? null,
        lowes: kn.lowes ?? null,
        action_buckets: kn.action_buckets ?? null,
        region_crosstab: kn.region_crosstab ?? null,
      },
      top30_ship_now: slimRows(parsed.top30_ship_now, 12),
      top30_behind_plan: slimRows(parsed.top30_behind_plan, 10),
      top20_stores: slimRows(parsed.top20_stores, 10),
      miss_analysis: parsed.miss_analysis
        ? { summary: (parsed.miss_analysis as Record<string, unknown>).summary }
        : null,
    };

    if (facts) {
      payload.assistant_facts = facts;
    }

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    delete payload.top30_behind_plan;
    delete payload.top20_stores;
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      assistant_facts: payload.assistant_facts,
      meta,
      key_numbers: payload.key_numbers,
      top30_ship_now: slimRows(parsed.top30_ship_now, 8),
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
