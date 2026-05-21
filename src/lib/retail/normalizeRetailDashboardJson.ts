/**
 * Ensures retail_opp_data.json matches Everde_West_Coast_Retail_Opportunity_Dashboard.html
 * (key_numbers.action_buckets, region_crosstab, wk14 field aliases).
 */
export function normalizeRetailDashboardJson(raw: string): string {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const kn = (d.key_numbers ?? {}) as Record<string, unknown>;

    for (const cust of ["hd", "lowes", "combined"]) {
      const row = kn[cust];
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (r.plan_thru_wk14 == null && r.plan_thru_wk != null) {
        r.plan_thru_wk14 = r.plan_thru_wk;
      }
      if (r.actual_thru_wk13 == null && r.actual_thru_wk != null) {
        r.actual_thru_wk13 = r.actual_thru_wk;
      }
    }

    const buckets = kn.action_buckets;
    if (
      (!buckets || typeof buckets !== "object") &&
      Array.isArray(d.action_buckets) &&
      d.action_buckets.length === 0
    ) {
      kn.action_buckets = {
        B1_ship_now: { units: 0, retail: 0, wholesale: 0 },
        B2_qc_release: { units: 0, retail: 0, wholesale: 0 },
        B3_crossreg: { units: null, retail: null, wholesale: null },
        B4_plan_at_risk: { units: 0, retail: 0, wholesale: null },
      };
    }

    if (!kn.region_crosstab || typeof kn.region_crosstab !== "object") {
      kn.region_crosstab = {
        HD_NCA: 0,
        HD_SCA: 0,
        Lowes_NCA: 0,
        Lowes_SCA: 0,
        Total_NCA: 0,
        Total_SCA: 0,
        Grand_Total: 0,
      };
    }

    d.key_numbers = kn;
    return JSON.stringify(d);
  } catch {
    return raw;
  }
}
