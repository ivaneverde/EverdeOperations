/** Container for weather dashboard artifacts (defaults to freight container). */
export function weatherBlobContainer(): string {
  return (
    process.env.AZURE_WEATHER_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

export function weatherDashboardJsonBlobPath(): string {
  return (
    process.env.AZURE_WEATHER_DASHBOARD_JSON_BLOB?.trim() ||
    "weather-data/latest/weather_dashboard_data.json"
  );
}
