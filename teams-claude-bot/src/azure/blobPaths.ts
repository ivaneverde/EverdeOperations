export function freightBlobContainer(): string {
  return process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
}

export function freightDashboardJsonPath(): string {
  return (
    process.env.AZURE_FREIGHT_DASHBOARD_JSON_BLOB?.trim() ||
    "freight/latest/dashboard_data.json"
  );
}

export function salesPlanDashboardJsonPath(): string {
  return (
    process.env.AZURE_SALES_PLAN_DASHBOARD_JSON_BLOB?.trim() ||
    "sales-plan/latest/sales_plan_data.json"
  );
}

export function retailDashboardJsonPath(): string {
  return (
    process.env.AZURE_RETAIL_DASHBOARD_JSON_BLOB?.trim() ||
    "retail-opportunity/latest/retail_opp_data.json"
  );
}

export function weatherDashboardJsonPath(): string {
  return (
    process.env.AZURE_WEATHER_DASHBOARD_JSON_BLOB?.trim() ||
    "weather-data/latest/weather_dashboard_data.json"
  );
}

export function nurseryDemandJsonPath(): string | null {
  const p = process.env.AZURE_NURSERY_DEMAND_JSON_BLOB?.trim();
  return p || null;
}
