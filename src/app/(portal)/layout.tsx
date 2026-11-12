import { cookies } from "next/headers";
import { PortalChrome } from "@/components/PortalChrome";
import { LicenseSuspended } from "@/components/license/LicenseSuspended";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/portalAuthConfig";
import { verifyPortalSessionToken } from "@/lib/auth/portalSession";
import { roleForEmail } from "@/lib/auth/viewRights";
import { arePreeminentServicesAllowed } from "@/lib/license/preeminentLicense";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  const user = token ? await verifyPortalSessionToken(token) : null;
  const viewRole = roleForEmail(user?.email);

  const license = await arePreeminentServicesAllowed();

  // Non-full users see maintenance only. Full ops keep chrome so Admin → License works.
  if (!license.allowed && viewRole !== "full") {
    return <LicenseSuspended status={license.status} />;
  }

  return (
    <PortalChrome
      viewRole={viewRole}
      userEmail={user?.email ?? null}
    >
      {!license.allowed ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
            Preeminent license unpaid/disabled for{" "}
            {license.status?.period ?? "this period"} — upload proof under Admin
            → License to restore service for everyone.
          </div>
          {children}
        </div>
      ) : (
        children
      )}
    </PortalChrome>
  );
}
