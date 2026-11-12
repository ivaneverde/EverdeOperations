import { NextResponse } from "next/server";
import {
  arePreeminentServicesAllowed,
  loadPreeminentLicenseStatus,
} from "@/lib/license/preeminentLicense";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await arePreeminentServicesAllowed();
  const status = gate.status ?? (await loadPreeminentLicenseStatus());
  return NextResponse.json({
    ok: true,
    enforce: gate.enforce,
    allowed: gate.allowed,
    status,
  });
}
