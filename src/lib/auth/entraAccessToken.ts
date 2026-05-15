import { createRemoteJWKSet, jwtVerify } from "jose";

/** Microsoft Graph application id — typical `aud` for SPA tokens used with Graph scopes. */
const GRAPH_AUDIENCE = "00000003-0000-0000-c000-000000000000";

/**
 * Validates an Entra access token (e.g. from MSAL with `User.Read`).
 * Returns JWT payload or null.
 */
export async function verifyEntraAccessToken(
  token: string,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const JWKS = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      ),
    );
    const spaClientId = process.env.NEXT_PUBLIC_MS_ENTRA_CLIENT_ID?.trim();
    const audiences = spaClientId
      ? [GRAPH_AUDIENCE, spaClientId]
      : [GRAPH_AUDIENCE];
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience: audiences,
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
