import { PORTAL_SECTIONS, getSectionDisplayNumber } from "@/config/portal";

/** What the portal covers — guides cross-section questions even when a dataset is thin. */
export function buildPortalCatalogSummary(): string {
  const sections = PORTAL_SECTIONS.map((s) => {
    const n = getSectionDisplayNumber(s);
    const prefix = n != null ? `Section ${n}` : "Main";
    const reports = s.reports.map((r) => r.title).join("; ");
    const dataNote = dataAvailabilityForSection(s.id);
    return `- **${prefix}: ${s.title}** — ${s.summary}${reports ? ` Reports: ${reports}.` : ""} ${dataNote}`;
  });

  return [
    "## Everde AI Operations Portal — section map",
    "You are the compendium analyst for this portal. Answer using the JSON datasets below plus this map.",
    "",
    ...sections,
    "",
    "**Retail opportunity:** West Coast retail HTML dashboard (10 tabs); JSON via `/api/retail/dashboard-data` (Blob). KPIs, action buckets B1–B4, top 30 ship-now.",
    "**Weather data:** regional weather HTML dashboard (9 tabs); JSON via `/api/weather/dashboard-data` (Blob snapshot). Refresh via share scripts or future API fetch.",
  ].join("\n");
}

function dataAvailabilityForSection(sectionId: string): string {
  if (sectionId === "load-board-freight" || sectionId === "main") {
    return "[Data: freight_dashboard_data when loaded.]";
  }
  if (sectionId === "sales-plan-review") {
    return "[Data: sales_plan_data + hd_ytd_following_week + lowes_ytd_following_week meta when loaded.]";
  }
  if (
    sectionId === "production-demand-plan" ||
    sectionId === "supply-inventory"
  ) {
    return "[Data: nursery_demand_data when loaded.]";
  }
  if (sectionId === "retail-sales-opportunity") {
    return "[Retail + weather: assistant loads retail_opp_data + weather_dashboard_data when published.]";
  }
  return "";
}
