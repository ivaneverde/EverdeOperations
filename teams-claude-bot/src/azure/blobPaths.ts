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

export function nurseryDemandJsonPath(): string {
  return (
    process.env.AZURE_NURSERY_DEMAND_JSON_BLOB?.trim() ||
    "nursery/latest/nursery_demand_data.json"
  );
}

export function nurserySupplyJsonPath(): string {
  return (
    process.env.AZURE_NURSERY_SUPPLY_JSON_BLOB?.trim() ||
    "nursery/latest/nursery_supply_data.json"
  );
}

export function hdYtdMetaJsonPath(): string {
  const prefix =
    process.env.AZURE_HD_YTD_BLOB_PREFIX?.trim() || "sales-plan/hd-ytd/latest";
  return `${prefix.replace(/\/$/, "")}/hd_ytd_meta.json`;
}

export function hdYtdRowsGzipPath(): string {
  const prefix =
    process.env.AZURE_HD_YTD_BLOB_PREFIX?.trim() || "sales-plan/hd-ytd/latest";
  return `${prefix.replace(/\/$/, "")}/hd_ytd_rows.json.gz`;
}

export function lowesYtdMetaJsonPath(): string {
  const prefix =
    process.env.AZURE_LOWES_YTD_BLOB_PREFIX?.trim() ||
    "sales-plan/lowes-ytd/latest";
  return `${prefix.replace(/\/$/, "")}/lowes_ytd_meta.json`;
}

export function lowesYtdRowsGzipPath(): string {
  const prefix =
    process.env.AZURE_LOWES_YTD_BLOB_PREFIX?.trim() ||
    "sales-plan/lowes-ytd/latest";
  return `${prefix.replace(/\/$/, "")}/lowes_ytd_rows.json.gz`;
}
