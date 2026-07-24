import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { FreightDashboardEmbed } from "@/components/reports/FreightDashboardEmbed";
import { HdYtdGridEmbed } from "@/components/reports/HdYtdGridEmbed";
import { RetailDashboardEmbed } from "@/components/reports/RetailDashboardEmbed";
import { SalesPlanDashboardEmbed } from "@/components/reports/SalesPlanDashboardEmbed";
import { SalesPlanOrPending } from "@/components/reports/SalesPlanOrPending";
import { WeatherDashboardEmbed } from "@/components/reports/WeatherDashboardEmbed";
import { FreightYtdSourcePage } from "@/components/reports/FreightYtdSourcePage";
import { ReportPlaceholder } from "@/components/ReportPlaceholder";
import { ReportShell } from "@/components/ReportShell";
import { getReport } from "@/config/portal";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/portalAuthConfig";
import { verifyPortalSessionToken } from "@/lib/auth/portalSession";
import {
  canAccessLowesAnalytics,
  isLowesRestrictedPath,
} from "@/lib/auth/viewRights";
import { salesPlanRegionFromSlug } from "@/lib/salesPlan/regionConfig";

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

  if (isLowesRestrictedPath(sec.id, rep.slug) || rep.lowesYtdGrid) {
    const jar = await cookies();
    const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
    const user = token ? await verifyPortalSessionToken(token) : null;
    if (!canAccessLowesAnalytics(user?.email)) {
      redirect("/");
    }
  }

  const navHref = rep.navHref?.trim();
  if (navHref) redirect(navHref);

  if (sec.id === "load-board-freight" && rep.slug === "everde-freight-data-ytd") {
    return <FreightYtdSourcePage section={sec} report={rep} />;
  }

  if (rep.hdYtdGrid === true) {
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <HdYtdGridEmbed kind="hd" />
      </ReportShell>
    );
  }

  if (rep.lowesYtdGrid === true) {
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <HdYtdGridEmbed kind="lowes" />
      </ReportShell>
    );
  }

  const freightTab =
    typeof rep.freightHtmlTab === "string" && rep.freightHtmlTab.trim().length > 0
      ? rep.freightHtmlTab.trim()
      : null;
  const isPrimaryFreightDashboard =
    sec.id === "load-board-freight" && rep.slug === "everde-freight-dashboard";
  const isFreightHtmlEmbed = isPrimaryFreightDashboard || freightTab != null;

  const salesPlanRegion = salesPlanRegionFromSlug(rep.slug);
  const salesPlanTab =
    typeof rep.salesPlanHtmlTab === "string" &&
    rep.salesPlanHtmlTab.trim().length > 0
      ? rep.salesPlanHtmlTab.trim()
      : null;
  const isSalesPlanHtmlEmbed = salesPlanTab != null;
  const isSalesPlanOrPending = false;

  const retailTab =
    typeof rep.retailHtmlTab === "string" && rep.retailHtmlTab.trim().length > 0
      ? rep.retailHtmlTab.trim()
      : null;
  const isRetailHtmlEmbed = retailTab != null;

  const weatherTab =
    typeof rep.weatherHtmlTab === "string" && rep.weatherHtmlTab.trim().length > 0
      ? rep.weatherHtmlTab.trim()
      : null;
  const isWeatherHtmlEmbed = weatherTab != null;

  if (isWeatherHtmlEmbed) {
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <WeatherDashboardEmbed weatherHtmlTab={weatherTab} />
      </ReportShell>
    );
  }

  if (isRetailHtmlEmbed) {
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <RetailDashboardEmbed retailHtmlTab={retailTab} />
      </ReportShell>
    );
  }

  if (isSalesPlanOrPending) {
    return (
      <ReportShell section={sec} report={rep}>
        <SalesPlanOrPending report={rep} />
      </ReportShell>
    );
  }

  if (isSalesPlanHtmlEmbed) {
    return (
      <ReportShell section={sec} report={rep} embedBody>
        <SalesPlanDashboardEmbed
          salesPlanHtmlTab={salesPlanTab}
          region={salesPlanRegion}
        />
      </ReportShell>
    );
  }

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
