import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { NextResponse } from "next/server";
import {
  getSalesManagerSummarySheet,
  isSalesManagerSummarySheetSlug,
  SALES_MANAGER_SUMMARY_DEFAULT_CSV_ROOT,
} from "@/config/salesManagerSummarySheets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sheet = searchParams.get("sheet") ?? "";
  if (!isSalesManagerSummarySheetSlug(sheet)) {
    return NextResponse.json(
      { error: "Unknown or missing sheet query parameter." },
      { status: 400 },
    );
  }

  const meta = getSalesManagerSummarySheet(sheet);
  const root =
    process.env.PORTAL_CSV_ROOT?.trim() || SALES_MANAGER_SUMMARY_DEFAULT_CSV_ROOT;
  const filePath = path.join(root, meta.csvFile);

  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return NextResponse.json(
      {
        error: "CSV not found",
        sheet: meta.slug,
        label: meta.label,
        expectedPath: filePath,
      },
      { status: 404 },
    );
  }

  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return NextResponse.json(
      {
        error: "CSV parse error",
        detail: first?.message ?? "Unknown",
      },
      { status: 422 },
    );
  }

  const rows = (parsed.data as string[][]).map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell))),
  );

  return NextResponse.json({
    sheet: meta.slug,
    label: meta.label,
    rows,
  });
}
