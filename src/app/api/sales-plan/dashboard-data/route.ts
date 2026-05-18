import { NextResponse } from "next/server";
import {
  downloadSalesPlanDashboardJsonFromBlob,
  downloadSalesPlanDashboardJsonFromLocal,
} from "@/lib/azure/salesPlanDashboardBlob";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";

export const dynamic = "force-dynamic";

/**
 * Serves `sales_plan_data.json` for the NOR CAL sales plan dashboard (Blob first, then local).
 * @see scripts/sales-plan-review/extract_sales_plan.py
 */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const fromBlob = await downloadSalesPlanDashboardJsonFromBlob();
  if (fromBlob) {
    return new NextResponse(fromBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Sales-Plan-Data-Source": "azure-blob",
      },
    });
  }

  const local = await downloadSalesPlanDashboardJsonFromLocal();
  if (local) {
    return new NextResponse(local, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Sales-Plan-Data-Source": "local-file",
      },
    });
  }

  return NextResponse.json(
    {
      error: "No sales_plan_data.json available.",
      hint:
        "Publish JSON to Blob (npm run publish:sales-plan-json) or place public/sales_plan_data.json. Run scripts/sales-plan-review/extract_sales_plan.py after weekly uploads.",
    },
    { status: 404 },
  );
}
