import { PortalChrome } from "@/components/PortalChrome";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalChrome>{children}</PortalChrome>;
}
