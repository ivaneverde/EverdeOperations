/** Container for retail opportunity artifacts (defaults to freight container). */
export function retailBlobContainer(): string {
  return (
    process.env.AZURE_RETAIL_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

export function retailDashboardJsonBlobPath(): string {
  return (
    process.env.AZURE_RETAIL_DASHBOARD_JSON_BLOB?.trim() ||
    "retail-opportunity/latest/retail_opp_data.json"
  );
}
