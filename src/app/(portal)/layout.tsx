import { cookies } from "next/headers";
import { PortalChrome } from "@/components/PortalChrome";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/portalAuthConfig";
import { verifyPortalSessionToken } from "@/lib/auth/portalSession";
import { roleForEmail } from "@/lib/auth/viewRights";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  const user = token ? await verifyPortalSessionToken(token) : null;
  const viewRole = roleForEmail(user?.email);

  return (
    <PortalChrome
      viewRole={viewRole}
      userEmail={user?.email ?? null}
    >
      {children}
    </PortalChrome>
  );
}
