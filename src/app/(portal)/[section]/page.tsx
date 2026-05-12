import { notFound } from "next/navigation";
import { TeamsIntegrationPanel } from "@/components/teams/TeamsIntegrationPanel";
import { ReportShell } from "@/components/ReportShell";
import { getSection, isSectionOnly, type PortalReport } from "@/config/portal";

const OVERVIEW: PortalReport = {
  slug: "_overview",
  title: "Teams",
  sourceRelativePath: "",
};

export default async function SectionPage(
  props: PageProps<"/[section]">,
) {
  const { section: sectionId } = await props.params;
  const section = getSection(sectionId);
  if (!section || !isSectionOnly(section)) notFound();

  return (
    <ReportShell section={section} report={OVERVIEW}>
      <TeamsIntegrationPanel />
    </ReportShell>
  );
}
