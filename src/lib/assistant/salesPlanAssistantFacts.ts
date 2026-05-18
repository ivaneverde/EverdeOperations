export function buildSalesPlanAssistantFacts(
  root: Record<string, unknown>,
): Record<string, unknown> {
  const meta = root.meta as Record<string, unknown> | undefined;
  const totalsYe = root.totals_ye as Record<string, unknown> | undefined;
  const missSummary = root.miss_summary;
  const channelSummary = root.channel_summary;

  const facts: Record<string, unknown> = {
    data_note: "NOR CAL Sales Plan Review dashboard JSON.",
    meta: meta ?? null,
    totals_ye: totalsYe ?? null,
    miss_summary: missSummary ?? null,
    channel_summary: channelSummary ?? null,
  };

  const topMiss = root.top_ki_miss;
  if (Array.isArray(topMiss)) {
    facts.top_key_items_missing_plan = topMiss.slice(0, 15);
  }

  const excess = root.excess_by_ki;
  if (Array.isArray(excess)) {
    facts.top_excess_at_farm = [...excess]
      .sort(
        (a, b) =>
          ((b as { excess?: number }).excess ?? 0) -
          ((a as { excess?: number }).excess ?? 0),
      )
      .slice(0, 12);
  }

  const ytd = root.ytd_performance;
  if (ytd && typeof ytd === "object") {
    facts.ytd_performance = ytd;
  }

  return facts;
}
