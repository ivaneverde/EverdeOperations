import { NextResponse } from "next/server";
import {
  portalAuthMisconfiguredResponse,
  requirePortalAuth,
} from "@/lib/auth/requirePortalAuth";
import type { PortalSessionUser } from "@/lib/auth/portalSession";

export type GuardedApi =
  | { ok: true; user: PortalSessionUser }
  | { ok: false; response: NextResponse };

export async function guardPortalApi(request: Request): Promise<GuardedApi> {
  const misconfig = portalAuthMisconfiguredResponse();
  if (misconfig) {
    return { ok: false, response: misconfig };
  }
  const auth = await requirePortalAuth(request);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.message }, { status: auth.status }),
    };
  }
  return { ok: true, user: auth.user };
}
