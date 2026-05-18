type FarmYtd = {
  ytdRevenue?: number;
  boValue?: number;
  crValue?: number;
  boPct?: number;
  crPct?: number;
  boCrPct?: number;
  boGoal?: number;
  crGoal?: number;
};

export function buildNurseryAssistantFacts(
  root: Record<string, unknown>,
): Record<string, unknown> {
  const meta = root.meta as Record<string, unknown> | undefined;
  const farmYTD = root.farmYTD as Record<string, FarmYtd> | undefined;

  const facts: Record<string, unknown> = {
    data_note: "Production & Demand Plan (Inventory Metrics / DEMAND pane).",
    report: meta
      ? {
          period: meta.reportPeriod,
          date: meta.reportDate,
          total_revenue: meta.totalRevenue,
          total_backorders: meta.totalBO,
          total_cancellations: meta.totalCR,
          bo_pct: meta.boPct,
          cr_pct: meta.crPct,
        }
      : null,
  };

  if (farmYTD) {
    const farms = Object.entries(farmYTD)
      .filter(([, v]) => (v.ytdRevenue ?? 0) > 0 || (v.boValue ?? 0) > 0)
      .map(([farm, v]) => ({
        farm,
        ytd_revenue: v.ytdRevenue,
        backorders: v.boValue,
        cancellations: v.crValue,
        bo_pct: v.boPct,
        cr_pct: v.crPct,
      }));

    const byRevenue = [...farms].sort(
      (a, b) => (b.ytd_revenue ?? 0) - (a.ytd_revenue ?? 0),
    );
    const byBo = [...farms].sort(
      (a, b) => (b.backorders ?? 0) - (a.backorders ?? 0),
    );
    const missingBoGoal = farms
      .filter((f) => {
        const row = farmYTD[f.farm];
        return (row?.boPct ?? 0) > (row?.boGoal ?? 0.02);
      })
      .slice(0, 8)
      .map((f) => f.farm);

    facts.top_farms_by_ytd_revenue = byRevenue.slice(0, 8);
    facts.top_farms_by_backorders = byBo.slice(0, 8);
    facts.farms_above_bo_goal = missingBoGoal;
  }

  const boReasons = root.boReasons;
  if (Array.isArray(boReasons) && boReasons.length > 0) {
    facts.top_backorder_reasons = [...boReasons]
      .sort(
        (a, b) =>
          ((b as { value?: number }).value ?? 0) -
          ((a as { value?: number }).value ?? 0),
      )
      .slice(0, 10);
  }

  return facts;
}
