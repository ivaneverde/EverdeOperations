import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { loadRetailDashboardJson } from "@/lib/retail/loadRetailDashboardJson";

export const dynamic = "force-dynamic";

/**
 * Serves `retail_opp_data.json` for the West Coast retail dashboard (Blob, local, or HTML embed).
 * @see scripts/retail-opportunity/extract_retail_opp.py
 */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadRetailDashboardJson();
  if (loaded) {
    return new NextResponse(loaded.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Retail-Data-Source": loaded.source,
      },
    });
  }

  return NextResponse.json(
    {
      error: "No retail_opp_data.json available.",
      hint:
        "Publish JSON to Blob (npm run publish:retail-json) or place public/retail_opp_data.json. Run scripts/retail-opportunity/extract_retail_opp.py after the five weekly workbooks land.",
    },
    { status: 404 },
  );
}
