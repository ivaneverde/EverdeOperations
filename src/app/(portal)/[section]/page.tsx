import { notFound } from "next/navigation";
import { NurseryDashboardEmbed } from "@/components/reports/NurseryDashboardEmbed";
import { TeamsIntegrationPanel } from "@/components/teams/TeamsIntegrationPanel";
import { ReportShell } from "@/components/ReportShell";
import {
  getSection,
  isNurserySectionOnly,
  isSectionOnly,
  nurserySectionShellReport,
  type PortalReport,
} from "@/config/portal";

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

  if (isNurserySectionOnly(section)) {
    const report = nurserySectionShellReport(section);
    return (
      <ReportShell section={section} report={report} embedBody>
        <NurseryDashboardEmbed pane={section.nurseryPane} />
      </ReportShell>
    );
  }

  return (
    <ReportShell section={section} report={OVERVIEW}>
      <TeamsIntegrationPanel />
    </ReportShell>
  );
}
