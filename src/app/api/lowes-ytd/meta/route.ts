import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import {
  canAccessLowesAnalytics,
  lowesDeniedMessage,
} from "@/lib/auth/viewRights";
import { loadYtdMeta } from "@/lib/hdYtd/loadHdYtdData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;
  if (!canAccessLowesAnalytics(gate.user.email)) {
    return NextResponse.json(
      { error: lowesDeniedMessage() },
      { status: 403 },
    );
  }

  const meta = await loadYtdMeta("lowes");
  if (!meta) {
    return NextResponse.json(
      {
        error:
          "Lowe's YTD data not published yet. Drop YTD BY STORE SKU*.xlsb in Sales Plan Review\\WeeklyDrop and run npm run sales-plan:lowes-ytd-extract-publish.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(meta, {
    headers: { "Cache-Control": "no-store" },
  });
}
