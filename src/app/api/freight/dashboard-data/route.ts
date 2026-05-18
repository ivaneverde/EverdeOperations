import { NextResponse } from "next/server";
import {
  downloadFreightDashboardJsonFromBlob,
  downloadFreightDashboardJsonFromLocal,
} from "@/lib/azure/freightDashboardBlob";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";

export const dynamic = "force-dynamic";

/**
 * Serves `dashboard_data.json` for the freight dashboard (Blob first, then local fallback).
 * @see scripts/freight/claude-handoff/extract_data.py
 */
export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;
  const fromBlob = await downloadFreightDashboardJsonFromBlob();
  if (fromBlob) {
    return new NextResponse(fromBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Freight-Data-Source": "azure-blob",
      },
    });
  }

  const local = await downloadFreightDashboardJsonFromLocal();
  if (local) {
    return new NextResponse(local, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Everde-Freight-Data-Source": "local-file",
      },
    });
  }

  return NextResponse.json(
    {
      error: "No dashboard_data.json available.",
      hint:
        "Set AZURE_STORAGE_CONNECTION_STRING and upload freight/latest/dashboard_data.json, or place public/dashboard_data.json locally (see scripts/freight/claude-handoff).",
    },
    { status: 404 },
  );
}
