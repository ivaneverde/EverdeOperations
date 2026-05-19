import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { loadWeatherDashboardJson } from "@/lib/weather/loadWeatherDashboardJson";

export const dynamic = "force-dynamic";

/**
 * Serves weather dashboard JSON (`WX` object: forecast + sales crosswalk).
 * Built by the Weather Data pipeline on the share; bootstrap from HTML for dev.
 */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadWeatherDashboardJson();
  if (loaded) {
    return new NextResponse(loaded.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Weather-Data-Source": loaded.source,
      },
    });
  }

  return NextResponse.json(
    {
      error: "No weather_dashboard_data.json available.",
      hint:
        "Publish JSON to Blob (npm run publish:weather-json) or place public/weather_dashboard_data.json. Weather HTML embeds snapshot data until the daily pipeline pushes updates.",
    },
    { status: 404 },
  );
}
