import { NextResponse } from "next/server";
import { loadYtdMeta } from "@/lib/hdYtd/loadHdYtdData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
