/**
 * Sales Manager Summary — one UTF-8 CSV per workbook sheet, dropped under
 * `PORTAL_CSV_ROOT` (see `.env.example`). Export each sheet from Excel with
 * “calculated values” so portal numbers match the workbook.
 */
export const SALES_MANAGER_SUMMARY_DEFAULT_CSV_ROOT =
  "//192.168.190.10/Claude Sandbox/DataDrops/PortalExports/sales-manager-summary";

export const SALES_MANAGER_SUMMARY_SHEETS = [
  { slug: "change_log", label: "Change Log", csvFile: "change_log.csv" },
  { slug: "methodology", label: "Methodology", csvFile: "methodology.csv" },
  { slug: "reading_guide", label: "Reading Guide", csvFile: "reading_guide.csv" },
  {
    slug: "executive_summary",
    label: "Executive Summary",
    csvFile: "executive_summary.csv",
  },
  {
    slug: "region_comparison",
    label: "Region Comparison",
    csvFile: "region_comparison.csv",
  },
  {
    slug: "top_30_ship_now_opp",
    label: "Top 30 by Ship-Now Opp",
    csvFile: "top_30_ship_now_opp.csv",
  },
  {
    slug: "top_30_items_behind_plan",
    label: "Top 30 Items Behind Plan",
    csvFile: "top_30_items_behind_plan.csv",
  },
  { slug: "top_20_stores", label: "Top 20 Stores", csvFile: "top_20_stores.csv" },
  {
    slug: "combined_suggested_orders_p2",
    label: "Combined Suggested Orders (P2)",
    csvFile: "combined_suggested_orders_p2.csv",
  },
] as const;

export type SalesManagerSummarySheetSlug =
  (typeof SALES_MANAGER_SUMMARY_SHEETS)[number]["slug"];

const SLUG_SET = new Set<string>(
  SALES_MANAGER_SUMMARY_SHEETS.map((s) => s.slug),
);

export function isSalesManagerSummarySheetSlug(
  value: string,
): value is SalesManagerSummarySheetSlug {
  return SLUG_SET.has(value);
}

export function getSalesManagerSummarySheet(slug: SalesManagerSummarySheetSlug) {
  const row = SALES_MANAGER_SUMMARY_SHEETS.find((s) => s.slug === slug);
  if (!row) throw new Error(`Unknown sheet slug: ${slug}`);
  return row;
}
