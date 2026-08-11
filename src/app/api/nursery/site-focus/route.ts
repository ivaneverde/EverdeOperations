import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { loadSiteFocusJson } from "@/lib/nursery/loadSiteFocusJson";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadSiteFocusJson();
  if (!loaded) {
    return NextResponse.json(
      {
        error: "Site Focus Summary not available",
        hint: "Drop WkNN_Site_Focus*.docx in DataDrops\\Inventory Metrics and run npm run nursery:extract-site-focus",
      },
      { status: 404 },
    );
  }

  return new NextResponse(loaded.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Everde-Site-Focus-Source": loaded.source,
    },
  });
}
