import { NextResponse } from "next/server";
import {
  entraTenantId,
  isPortalAuthRequired,
  portalSessionSecret,
} from "@/lib/auth/portalAuthConfig";
import {
  getPortalSessionFromRequest,
  userFromEntraAccessToken,
  type PortalSessionUser,
} from "@/lib/auth/portalSession";

export type PortalAuthResult =
  | { ok: true; user: PortalSessionUser }
  | { ok: false; status: number; message: string };

/**
 * When PORTAL_REQUIRE_AUTH=1, requires valid session cookie or Bearer Entra token (@everde.com).
 * When unset, allows anonymous access (local dev default).
 */
export async function requirePortalAuth(
  request: Request,
): Promise<PortalAuthResult> {
  if (!isPortalAuthRequired()) {
    return {
      ok: true,
      user: { email: "dev@local", name: "Dev", oid: "" },
    };
  }

  const session = await getPortalSessionFromRequest(request);
  if (session) {
    return { ok: true, user: session };
  }

  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") || auth?.startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;
  const tenantId = entraTenantId();

  if (bearer && tenantId) {
    const user = await userFromEntraAccessToken(bearer, tenantId);
    if (user) return { ok: true, user };
  }

  return {
    ok: false,
    status: 401,
    message:
      "Sign in required. Use /auth/sign-in with your @everde.com Microsoft account.",
  };
}

export function portalAuthMisconfiguredResponse(): NextResponse | null {
  if (!isPortalAuthRequired()) return null;
  if (portalSessionSecret()) return null;
  return NextResponse.json(
    {
      error:
        "Portal auth is enabled but PORTAL_SESSION_SECRET is missing or too short (min 32 characters).",
    },
    { status: 503 },
  );
}
