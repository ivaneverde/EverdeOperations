import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import {
  canAccessHdAnalytics,
  hdDeniedMessage,
} from "@/lib/auth/viewRights";
import { loadHdYtdMeta } from "@/lib/hdYtd/loadHdYtdData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;
  if (!canAccessHdAnalytics(gate.user.email)) {
    return NextResponse.json({ error: hdDeniedMessage() }, { status: 403 });
  }

  const meta = await loadHdYtdMeta();
  if (!meta) {
    return NextResponse.json(
      {
        error:
          "HD YTD data not published yet. Drop HD Sales YTD with Following Week Sales*.xlsx in Sales Plan Review\\WeeklyDrop and run npm run sales-plan:hd-ytd-extract-publish.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(meta, {
    headers: { "Cache-Control": "no-store" },
  });
}
