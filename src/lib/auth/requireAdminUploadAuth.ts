import { verifyEntraAccessToken } from "@/lib/auth/entraAccessToken";

export type AdminUploadAuthResult =
  | { ok: true; via: "shared_key" | "entra_token" }
  | { ok: false; status: number; message: string };

function allowedEmailDomain(): string {
  return (process.env.EVERDE_ALLOWED_EMAIL_DOMAIN || "everde.com")
    .replace(/^@/, "")
    .toLowerCase();
}

function emailFromPayload(payload: Record<string, unknown>): string {
  return String(
    payload.preferred_username ?? payload.upn ?? payload.email ?? "",
  ).toLowerCase();
}

/**
 * Protects POST /api/admin/freight-upload.
 * 1) If EVERDE_ADMIN_UPLOAD_KEY is set and x-everde-admin-key matches → allow (automation).
 * 2) Else Authorization: Bearer & valid Entra token with @everde.com (or EVERDE_ALLOWED_EMAIL_DOMAIN) UPN.
 */
export async function requireAdminUploadAuth(
  request: Request,
): Promise<AdminUploadAuthResult> {
  const shared = process.env.EVERDE_ADMIN_UPLOAD_KEY?.trim();
  const sentKey = request.headers.get("x-everde-admin-key")?.trim();
  if (shared && sentKey === shared) {
    return { ok: true, via: "shared_key" };
  }

  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") || auth?.startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;
  const tenantId =
    process.env.AZURE_AD_TENANT_ID?.trim() ||
    process.env.NEXT_PUBLIC_MS_ENTRA_TENANT_ID?.trim();

  if (!bearer || !tenantId || tenantId === "organizations") {
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

  const domain = allowedEmailDomain();
  const upn = emailFromPayload(payload);
  if (!upn.endsWith(`@${domain}`)) {
    return {
      ok: false,
      status: 403,
      message: `Only @${domain} accounts may upload.`,
    };
  }

  return { ok: true, via: "entra_token" };
}
