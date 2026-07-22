import { NextResponse } from "next/server";
import {
  filterYtdRows,
  loadYtdMeta,
  loadYtdRows,
} from "@/lib/hdYtd/loadHdYtdData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 2000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = Math.max(0, Number(url.searchParams.get("start") || "0") || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") || "200") || 200),
  );
  const q = url.searchParams.get("q")?.trim() || "";

  const [meta, rows] = await Promise.all([
    loadYtdMeta("lowes"),
    loadYtdRows("lowes"),
  ]);
  if (!meta || !rows) {
    return NextResponse.json(
      {
        error:
          "Lowe's YTD rows not published yet. Run npm run sales-plan:lowes-ytd-extract-publish.",
      },
      { status: 404 },
    );
  }

  const filtered = q ? filterYtdRows(rows, meta.columns, q) : rows;
  const slice = filtered.slice(start, start + limit);

  return NextResponse.json(
    {
      start,
      limit,
      q,
      total: filtered.length,
      rowCountUnfiltered: meta.rowCount,
      rows: slice,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
