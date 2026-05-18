export const PORTAL_SESSION_COOKIE = "everde_portal_session";

/** When "1", portal pages and protected APIs require a valid Everde session cookie. */
export function isPortalAuthRequired(): boolean {
  return process.env.PORTAL_REQUIRE_AUTH?.trim() === "1";
}

export function portalSessionSecret(): string | null {
  const s = process.env.PORTAL_SESSION_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

export function entraTenantId(): string | null {
  const t =
    process.env.AZURE_AD_TENANT_ID?.trim() ||
    process.env.NEXT_PUBLIC_MS_ENTRA_TENANT_ID?.trim();
  if (!t || t === "organizations") return null;
  return t;
}
