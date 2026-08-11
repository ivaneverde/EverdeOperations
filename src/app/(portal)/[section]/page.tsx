import { notFound, redirect } from "next/navigation";
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
  if (!section) notFound();

  if (isNurserySectionOnly(section)) {
    const report = nurserySectionShellReport(section);
    return (
      <ReportShell section={section} report={report} embedBody>
        <NurseryDashboardEmbed pane={section.nurseryPane} />
      </ReportShell>
    );
  }

  if (isSectionOnly(section)) {
    return (
      <ReportShell section={section} report={OVERVIEW}>
        <TeamsIntegrationPanel />
      </ReportShell>
    );
  }

  const first =
    section.reports.find((r) => !r.hideFromNav) ?? section.reports[0];
  if (first) {
    const href = first.navHref?.trim() || `/${section.id}/${first.slug}`;
    redirect(href);
  }

  notFound();
}
