import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isPortalAuthRequired,
  PORTAL_SESSION_COOKIE,
  portalSessionSecret,
  entraTenantId,
} from "@/lib/auth/portalAuthConfig";
import {
  createPortalSessionToken,
  sessionCookieOptions,
  userFromEntraAccessToken,
  verifyPortalSessionToken,
} from "@/lib/auth/portalSession";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export async function GET() {
  if (!isPortalAuthRequired()) {
    return NextResponse.json({ authenticated: false, required: false });
  }
  if (!portalSessionSecret()) {
    return NextResponse.json(
      { error: "PORTAL_SESSION_SECRET not configured." },
      { status: 503 },
    );
  }
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, required: true });
  }
  const user = await verifyPortalSessionToken(token);
  if (!user) {
    return NextResponse.json({ authenticated: false, required: true });
  }
  return NextResponse.json({
    authenticated: true,
    required: true,
    email: user.email,
    name: user.name,
  });
}

export async function POST(request: Request) {
  if (!portalSessionSecret()) {
    return NextResponse.json(
      {
        error:
          "PORTAL_SESSION_SECRET is missing or too short (min 32 characters).",
      },
      { status: 503 },
    );
  }

  const tenantId = entraTenantId();
  if (!tenantId) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_MS_ENTRA_TENANT_ID / AZURE_AD_TENANT_ID not set." },
      { status: 503 },
    );
  }

  let bearer: string | null = null;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") || auth?.startsWith("bearer ")) {
    bearer = auth.slice(7).trim();
  } else {
    try {
      const body = (await request.json()) as { accessToken?: string };
      bearer = body.accessToken?.trim() ?? null;
    } catch {
      bearer = null;
    }
  }

  if (!bearer) {
    return NextResponse.json(
      { error: "Missing Bearer token or accessToken in body." },
      { status: 400 },
    );
  }

  const user = await userFromEntraAccessToken(bearer, tenantId);
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Invalid token or account is not an allowed @everde.com user.",
      },
      { status: 403 },
    );
  }

  const sessionToken = await createPortalSessionToken(user);
  if (!sessionToken) {
    return NextResponse.json(
      { error: "Could not create session." },
      { status: 503 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    email: user.email,
    name: user.name,
  });
  res.cookies.set(
    PORTAL_SESSION_COOKIE,
    sessionToken,
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return res;
}
