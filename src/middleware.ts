import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isPortalAuthRequired,
  PORTAL_SESSION_COOKIE,
  portalSessionSecret,
} from "@/lib/auth/portalAuthConfig";
import { verifyPortalSessionToken } from "@/lib/auth/portalSession";

const PUBLIC_PATH_PREFIXES = [
  "/auth/sign-in",
  "/auth/msal-bridge",
  "/api/health",
  "/api/auth/session",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  if (!isPortalAuthRequired()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    isPublicPath(pathname)
  ) {
    return NextResponse.next();
  }

  if (!portalSessionSecret()) {
    return NextResponse.json(
      {
        error:
          "Portal auth enabled (PORTAL_REQUIRE_AUTH=1) but PORTAL_SESSION_SECRET is not set (min 32 chars).",
      },
      { status: 503 },
    );
  }

  const token = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (token) {
    const user = await verifyPortalSessionToken(token);
    if (user) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint: "Sign in at /auth/sign-in with your @everde.com account.",
      },
      { status: 401 },
    );
  }

  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("returnUrl", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
