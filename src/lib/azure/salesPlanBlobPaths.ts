/** Container for sales plan artifacts (defaults to freight container). */
export function salesPlanBlobContainer(): string {
  return (
    process.env.AZURE_SALES_PLAN_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

/** Blob path for live NOR CAL sales plan JSON. */
export function salesPlanDashboardJsonBlobPath(): string {
  return (
    process.env.AZURE_SALES_PLAN_DASHBOARD_JSON_BLOB?.trim() ||
    "sales-plan/latest/sales_plan_data.json"
  );
}
