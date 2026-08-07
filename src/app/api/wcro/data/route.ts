import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { loadWcroDataJson } from "@/lib/wcro/loadWcroData";

export const dynamic = "force-dynamic";

/**
 * Serves WCRO extract JSON for portal views.
 * @see scripts/wcro/extract_wcro.py
 */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadWcroDataJson();
  if (!loaded) {
    return NextResponse.json(
      {
        error: "WCRO data not available — run extract_wcro.py first",
        hint: "python scripts/wcro/extract_wcro.py",
      },
      { status: 404 },
    );
  }

  return new NextResponse(loaded.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Everde-Wcro-Data-Source": loaded.source,
    },
  });
}
