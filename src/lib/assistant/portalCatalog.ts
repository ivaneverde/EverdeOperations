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
    "**Retail / Supply Inventory:** workbook paths exist in the portal; structured JSON feeds are not loaded yet unless a dataset block is present below.",
  ].join("\n");
}

function dataAvailabilityForSection(sectionId: string): string {
  if (sectionId === "load-board-freight" || sectionId === "main") {
    return "[Data: freight_dashboard_data when loaded.]";
  }
  if (sectionId === "sales-plan-review") {
    return "[Data: sales_plan_data when loaded.]";
  }
  if (
    sectionId === "production-demand-plan" ||
    sectionId === "supply-inventory"
  ) {
    return "[Data: nursery_demand_data when loaded.]";
  }
  if (sectionId === "retail-sales-opportunity") {
    return "[Partial: freight tabs embedded; retail workbooks not in JSON yet.]";
  }
  return "";
}
