import { notFound, redirect } from "next/navigation";
import { FreightDashboardEmbed } from "@/components/reports/FreightDashboardEmbed";
import { FreightYtdSourcePage } from "@/components/reports/FreightYtdSourcePage";
import { ReportPlaceholder } from "@/components/ReportPlaceholder";
import { SalesManagerSummaryPage } from "@/components/reports/SalesManagerSummaryPage";
import { ReportShell } from "@/components/ReportShell";
import { getReport } from "@/config/portal";

export default async function ReportPage(
  props: PageProps<"/[section]/[report]">,
) {
  const { section, report } = await props.params;
  if (
    (section === "supply-inventory" ||
      section === "production-demand-plan") &&
    report === "overview"
  ) {
    redirect(`/${section}`);
  }

  const found = getReport(section, report);
  if (!found) notFound();

  const { section: sec, report: rep } = found;

  const navHref = rep.navHref?.trim();
  if (navHref) redirect(navHref);

  if (sec.id === "retail-sales-opportunity" && rep.slug === "sales-manager-summary") {
    return <SalesManagerSummaryPage section={sec} report={rep} />;
  }

  if (sec.id === "load-board-freight" && rep.slug === "everde-freight-data-ytd") {
    return <FreightYtdSourcePage section={sec} report={rep} />;
  }

  const freightTab =
    typeof rep.freightHtmlTab === "string" && rep.freightHtmlTab.trim().length > 0
      ? rep.freightHtmlTab.trim()
      : null;
  const isPrimaryFreightDashboard =
    sec.id === "load-board-freight" && rep.slug === "everde-freight-dashboard";
  const isFreightHtmlEmbed = isPrimaryFreightDashboard || freightTab != null;

  if (isFreightHtmlEmbed) {
    const showPipeline = isPrimaryFreightDashboard;
    const tab = freightTab ?? "Cover";
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <FreightDashboardEmbed
          freightHtmlTab={tab}
          showPipelineControls={showPipeline}
        />
      </ReportShell>
    );
  }

  return (
    <ReportShell section={sec} report={rep}>
      <ReportPlaceholder report={rep} />
    </ReportShell>
  );
}
