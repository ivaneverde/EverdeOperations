/**
 * Central configuration for Everde AI Operations portal navigation.
 * Paths are relative to the DataDrops root on the internal share.
 *
 * Deployment: the app is developed and tested on localhost for speed.
 * The product target is a hosted web portal for many users on phones,
 * tablets, and desktop browsers (responsive UI, public or SSO URL, etc.).
 */
export const DATA_ROOT_UNC =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops";

export type PortalReport = {
  slug: string;
  title: string;
  /** Path under DATA_ROOT_UNC for operators / future ETL */
  sourceRelativePath: string;
  /**
   * When set, shown as the report Source path instead of `DATA_ROOT_UNC` + `sourceRelativePath`.
   * Use for files that still live under another share root (e.g. legacy JS Files).
   */
  sourceAbsoluteUnc?: string;
  /** Optional Excel-style tab names to mirror in the web UI later */
  sheetTabs?: string[];
  notes?: string;
};

/** UNC path shown in the portal for a report's source file (workbook, HTML, etc.). */
export function getReportSourceUncPath(report: PortalReport): string | null {
  const abs = report.sourceAbsoluteUnc?.trim();
  if (abs) {
    return abs.replace(/\//g, "\\");
  }
  const rel = report.sourceRelativePath?.trim();
  if (!rel) return null;
  return `${DATA_ROOT_UNC}\\${rel}`;
}

export type PortalSection = {
  id: string;
  title: string;
  summary: string;
  shareFolder: string;
  /** When true, navigation goes to /[id] only; `reports` should be empty. */
  sectionOnly?: boolean;
  reports: PortalReport[];
};

export const PORTAL_SECTIONS: PortalSection[] = [
  {
    id: "retail-sales-opportunity",
    title: "Retail Sales Opportunity",
    summary:
      "West Coast retail opportunity, variance, and miss analysis with weather-informed context.",
    shareFolder: "West Coast Retail Opportunity",
    reports: [
      {
        slug: "for-source-miss-report",
        title: "FOR Source Miss Report",
        sourceRelativePath:
          "West Coast Retail Opportunity\\FOR Source Miss Report - Wk14 2026 (Refresh 5.6).xlsx",
      },
      {
        slug: "hd-sales-variance-allocation",
        title: "HD Sales Variance & Allocation",
        sourceRelativePath:
          "West Coast Retail Opportunity\\HD Sales Variance & Allocation - Wk14 2026 (Refresh 5.6).xlsx",
      },
      {
        slug: "low-sales-variance-allocation",
        title: "LOW Sales Variance & Allocation",
        sourceRelativePath:
          "West Coast Retail Opportunity\\LOW Sales Variance & Allocation - Wk14 2026 (Refresh 5.6).xlsx",
      },
      {
        slug: "sales-manager-summary",
        title: "Sales Manager Summary",
        sourceRelativePath:
          "West Coast Retail Opportunity\\Sales Manager Summary - Wk14 2026 (Refresh 5.6).xlsx",
        sheetTabs: [
          "Change Log",
          "Methodology",
          "Reading Guide",
          "Executive Summary",
          "Region Comparison",
          "Top 30 by Ship-Now Opp",
          "Top 30 Items Behind Plan",
          "Top 20 Stores",
          "Combined Suggested Orders (P2)",
        ],
      },
      {
        slug: "item-level-miss-analysis",
        title: "Item-Level Miss Analysis",
        sourceRelativePath:
          "West Coast Retail Opportunity\\Wk13 Item-Level Miss Analysis (Refresh 5.6).xlsx",
      },
    ],
  },
  {
    id: "sales-plan-review",
    title: "Sales Plan Review",
    summary:
      "Forward-looking inventory versus sales plan (region-scoped workbooks, shared engine).",
    shareFolder: "Sales Plan Review",
    reports: [
      {
        slug: "nor-cal-forward-looking",
        title: "NOR CAL — Forward Looking INV vs Sales Plan",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 050426.xlsx",
        sheetTabs: [
          "Read Me & Methodology",
          "Build Health",
          "Changes",
          "Exec Summary",
          "Plan by KI",
        ],
        notes:
          "Two-stage allocation (defend plan, then lift from surplus) documented on Read Me.",
      },
      {
        slug: "or-forward-looking-ytd",
        title: "OR Forward Looking YTD Miss vs Inventory",
        sourceRelativePath:
          "Sales Plan Review\\OR Forward Looking YTD Miss vs Inventory 051126.xlsx",
      },
    ],
  },
  {
    id: "load-board-freight",
    title: "Load Board & Freight Analysis",
    summary:
      "Third-party lanes, carrier spreads, in-house vs 3P economics, and YTD freight data.",
    shareFolder: "Freight",
    reports: [
      {
        slug: "3p-top5-lanes-carrier-analysis",
        title: "3P Top 5 Lanes — Carrier Cost Analysis",
        sourceRelativePath: "Freight\\3P_Top5_Lanes_Carrier_Analysis_2026-05-04.xlsx",
        sheetTabs: [
          "How to Read",
          "1. GFL-TEXAS-DALLAS-R",
          "2. MCR-TEXAS-DALLAS-R",
          "3. GFL-TEXAS-HOUSTON-R",
          "4. GFL-TEXAS-AUSTIN-WACO-R",
          "5. FOR-CALIFORNIA-SAN-DIEGO-V",
        ],
      },
      {
        slug: "everde-freight-dashboard",
        title: "Everde Freight Dashboard",
        sourceRelativePath: "Freight\\Everde_Freight_Dashboard_2026-05-11.xlsb",
      },
      {
        slug: "everde-freight-data-ytd",
        title: "Everde Freight Data (YTD)",
        sourceRelativePath:
          "Everde Freight Data YTD 5-09-26 with MAR-26 Rates with adj 26 BUD YE COSTS.xlsb",
        notes:
          "Large binary workbook — candidate for warehouse / parquet in a later phase.",
      },
      {
        slug: "pricing-file-total-adjustments",
        title: "Pricing File — Total Adjustments",
        sourceRelativePath:
          "Freight\\Pricing File - Total Adjustments rev.05052026.xlsx",
      },
      {
        slug: "legacy-html-dashboard",
        title: "Legacy HTML Dashboard (reference)",
        sourceRelativePath: "Freight\\Everde_Freight_Dashboard_2026-05-04.html",
        notes:
          "Prior HTML export; useful for visual parity while rebuilding charts in React.",
      },
    ],
  },
  {
    id: "communication",
    title: "Communication - Teams",
    sectionOnly: true,
    summary:
      "Microsoft Teams–backed messaging and channel surfacing for executives (Graph API).",
    shareFolder: "(Microsoft Teams — integrate via Graph)",
    reports: [],
  },
];

export function getSection(sectionId: string): PortalSection | undefined {
  return PORTAL_SECTIONS.find((s) => s.id === sectionId);
}

export function getReport(
  sectionId: string,
  reportSlug: string,
): { section: PortalSection; report: PortalReport } | undefined {
  const section = getSection(sectionId);
  if (!section || section.sectionOnly) return undefined;
  const report = section.reports.find((r) => r.slug === reportSlug);
  if (!report) return undefined;
  return { section, report };
}

export function isSectionOnly(section: PortalSection): boolean {
  return section.sectionOnly === true;
}
