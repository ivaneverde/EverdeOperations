import { verifyEntraAccessToken } from "@/lib/auth/entraAccessToken";
import {
  allowedEmailDomain,
  emailFromEntraPayload,
  isAllowedEverdeEmail,
} from "@/lib/auth/everdeIdentity";
import { entraTenantId } from "@/lib/auth/portalAuthConfig";
import { getPortalSessionFromRequest } from "@/lib/auth/portalSession";

export type AdminUploadAuthResult =
  | { ok: true; via: "shared_key" | "entra_token" | "session" }
  | { ok: false; status: number; message: string };

/**
 * Protects POST /api/admin/freight-upload.
 * 1) If EVERDE_ADMIN_UPLOAD_KEY is set and x-everde-admin-key matches → allow (automation).
 * 2) Else valid portal session cookie (@everde.com).
 * 3) Else Authorization: Bearer with valid Entra token (@everde.com).
 */
export async function requireAdminUploadAuth(
  request: Request,
): Promise<AdminUploadAuthResult> {
  const shared = process.env.EVERDE_ADMIN_UPLOAD_KEY?.trim();
  const sentKey = request.headers.get("x-everde-admin-key")?.trim();
  if (shared && sentKey === shared) {
    return { ok: true, via: "shared_key" };
  }

  const session = await getPortalSessionFromRequest(request);
  if (session) {
    return { ok: true, via: "session" };
  }

  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") || auth?.startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;
  const tenantId = entraTenantId();

  if (!bearer || !tenantId) {
    return {
      ok: false,
      status: 401,
      message:
        "Sign in with Microsoft (Everde tenant) or supply x-everde-admin-key when EVERDE_ADMIN_UPLOAD_KEY is configured.",
    };
  }

  const payload = await verifyEntraAccessToken(bearer, tenantId);
  if (!payload) {
    return { ok: false, status: 401, message: "Invalid or expired token." };
  }

  const upn = emailFromEntraPayload(payload);
  if (!isAllowedEverdeEmail(upn)) {
    return {
      ok: false,
      status: 403,
      message: `Only @${allowedEmailDomain()} accounts may upload.`,
    };
  }

  return { ok: true, via: "entra_token" };
}
