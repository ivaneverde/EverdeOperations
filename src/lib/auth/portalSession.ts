import { SignJWT, jwtVerify } from "jose";
import {
  emailFromEntraPayload,
  isAllowedEverdeEmail,
} from "@/lib/auth/everdeIdentity";
import {
  PORTAL_SESSION_COOKIE,
  portalSessionSecret,
} from "@/lib/auth/portalAuthConfig";
import {
  verifyEntraAccessToken,
  verifyEntraIdToken,
} from "@/lib/auth/entraAccessToken";

const SESSION_DAYS = 7;

export type PortalSessionUser = {
  email: string;
  name: string;
  oid: string;
};

function secretKey(): Uint8Array | null {
  const secret = portalSessionSecret();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function createPortalSessionToken(
  user: PortalSessionUser,
): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: user.email,
    name: user.name,
    oid: user.oid,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_DAYS * 24 * 60 * 60)
    .sign(key);
}

export async function verifyPortalSessionToken(
  token: string,
): Promise<PortalSessionUser | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const email = String(payload.email ?? "").toLowerCase();
    if (!isAllowedEverdeEmail(email)) return null;
    return {
      email,
      name: String(payload.name ?? ""),
      oid: String(payload.oid ?? ""),
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function portalUserFromEntraPayload(
  payload: Record<string, unknown>,
): PortalSessionUser | null {
  const email = emailFromEntraPayload(payload);
  if (!isAllowedEverdeEmail(email)) return null;
  return {
    email,
    name: String(payload.name ?? ""),
    oid: String(payload.oid ?? payload.sub ?? ""),
  };
}

export async function userFromEntraAccessToken(
  bearer: string,
  tenantId: string,
): Promise<PortalSessionUser | null> {
  const payload = await verifyEntraAccessToken(bearer, tenantId);
  if (!payload) return null;
  return portalUserFromEntraPayload(payload);
}

export async function userFromEntraIdToken(
  idToken: string,
  tenantId: string,
): Promise<PortalSessionUser | null> {
  const payload = await verifyEntraIdToken(idToken, tenantId);
  if (!payload) return null;
  return portalUserFromEntraPayload(payload);
}

/** Verified access token + MSAL account username when JWT lacks email claims. */
export async function userFromEntraAccessTokenAndAccount(
  bearer: string,
  tenantId: string,
  accountUsername: string,
): Promise<PortalSessionUser | null> {
  const payload = await verifyEntraAccessToken(bearer, tenantId);
  if (!payload) return null;
  const fromToken = portalUserFromEntraPayload(payload);
  if (fromToken) return fromToken;
  const email = accountUsername.trim().toLowerCase();
  if (!isAllowedEverdeEmail(email)) return null;
  return {
    email,
    name: String(payload.name ?? ""),
    oid: String(payload.oid ?? payload.sub ?? ""),
  };
}

export type EntraSessionCredentials = {
  accessToken: string;
  idToken?: string;
  accountUsername?: string;
};

export async function userFromEntraSessionCredentials(
  creds: EntraSessionCredentials,
  tenantId: string,
): Promise<PortalSessionUser | null> {
  const access = creds.accessToken.trim();
  if (!access) return null;

  const fromAccess = await userFromEntraAccessToken(access, tenantId);
  if (fromAccess) return fromAccess;

  const idToken = creds.idToken?.trim();
  if (idToken) {
    const fromId = await userFromEntraIdToken(idToken, tenantId);
    if (fromId) return fromId;
  }

  const username = creds.accountUsername?.trim();
  if (username) {
    return userFromEntraAccessTokenAndAccount(access, tenantId, username);
  }

  return null;
}

export async function getPortalSessionFromRequest(
  request: Request,
): Promise<PortalSessionUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${PORTAL_SESSION_COOKIE}=([^;]+)`),
  );
  if (!match?.[1]) return null;
  return verifyPortalSessionToken(decodeURIComponent(match[1]));
}
