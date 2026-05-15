import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Uptime / deploy smoke (Vercel, probes). No auth; no secrets. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "everde-ai-operations",
    env: process.env.VERCEL_ENV ?? null,
  });
}
