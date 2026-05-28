import { NextResponse } from "next/server";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { loadSalesPlanDashboardJson } from "@/lib/salesPlan/loadSalesPlanDashboardJson";

export const dynamic = "force-dynamic";

/** Oregon sales plan JSON (Blob, public/or_sales_plan_data.json, or HTML stub). */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadSalesPlanDashboardJson("or");
  if (loaded) {
    return new NextResponse(loaded.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Sales-Plan-Data-Source": loaded.source,
        "X-Everde-Sales-Plan-Region": "or",
      },
    });
  }

  return NextResponse.json(
    {
      error: "No or_sales_plan_data.json available.",
      hint:
        "Run build_or_workbook_patched.py, then extract_sales_plan.py --region OR, and npm run sales-plan:or-publish. See scripts/sales-plan-review/CURSOR_HANDOFF_Sales_Plan_OR.md.",
    },
    { status: 404 },
  );
}
