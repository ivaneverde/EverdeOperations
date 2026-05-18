import { NextResponse } from "next/server";
import { requireAdminUploadAuth } from "@/lib/auth/requireAdminUploadAuth";
import { uploadSalesPlanIncomingFile } from "@/lib/azure/salesPlanDashboardBlob";

export const dynamic = "force-dynamic";

const DEFAULT_MAX = 120 * 1024 * 1024;

/**
 * Multipart: `inv` = Inventory Transform, `ytd` = 2026 Sales by Item (both optional but at least one).
 */
export async function POST(request: Request) {
  const auth = await requireAdminUploadAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status },
    );
  }

  const maxBytes =
    Number(process.env.EVERDE_SALES_PLAN_UPLOAD_MAX_BYTES?.trim()) ||
    Number(process.env.EVERDE_FREIGHT_UPLOAD_MAX_BYTES?.trim()) ||
    DEFAULT_MAX;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, {
      status: 400,
    });
  }

  const inv = form.get("inv");
  const ytd = form.get("ytd");
  const uploads: { kind: "inv" | "ytd"; file: File }[] = [];

  if (inv instanceof File && inv.size > 0) uploads.push({ kind: "inv", file: inv });
  if (ytd instanceof File && ytd.size > 0) uploads.push({ kind: "ytd", file: ytd });

  if (uploads.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one file: inv and/or ytd." },
      { status: 400 },
    );
  }

  for (const { file } of uploads) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
      return NextResponse.json(
        { error: "Sales plan uploads accept .xlsx or .xlsm only." },
        { status: 400 },
      );
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (max ${maxBytes} bytes).` },
        { status: 413 },
      );
    }
  }

  try {
    const results = [];
    for (const { kind, file } of uploads) {
      results.push({
        kind,
        ...(await uploadSalesPlanIncomingFile(file, kind)),
      });
    }
    return NextResponse.json({
      ok: true,
      authVia: auth.via,
      uploads: results,
      hint:
        "On a machine with VPN/share access, run scripts/sales-plan-review/extract_sales_plan.py with these files, then npm run publish:sales-plan-json.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
