import { notFound } from "next/navigation";
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
  const found = getReport(section, report);
  if (!found) notFound();

  const { section: sec, report: rep } = found;

  if (sec.id === "retail-sales-opportunity" && rep.slug === "sales-manager-summary") {
    return <SalesManagerSummaryPage section={sec} report={rep} />;
  }

  if (sec.id === "load-board-freight" && rep.slug === "everde-freight-dashboard") {
    return (
      <ReportShell section={sec} report={rep}>
        <FreightDashboardEmbed />
      </ReportShell>
    );
  }

  if (sec.id === "load-board-freight" && rep.slug === "everde-freight-data-ytd") {
    return <FreightYtdSourcePage section={sec} report={rep} />;
  }

  return (
    <ReportShell section={sec} report={rep}>
      <ReportPlaceholder report={rep} />
    </ReportShell>
  );
}
