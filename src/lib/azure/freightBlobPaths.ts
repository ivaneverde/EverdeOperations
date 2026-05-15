/** Container for freight artifacts (JSON, incoming xlsb, etc.). */
export function freightBlobContainer(): string {
  return (
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight"
  );
}

/** Blob path for the live dashboard JSON served by GET /api/freight/dashboard-data. */
export function freightDashboardJsonBlobPath(): string {
  return (
    process.env.AZURE_FREIGHT_DASHBOARD_JSON_BLOB?.trim() ||
    "freight/latest/dashboard_data.json"
  );
}
