import { NextResponse } from "next/server";
import { loadHdYtdMeta } from "@/lib/hdYtd/loadHdYtdData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
