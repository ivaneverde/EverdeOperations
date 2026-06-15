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

/** Workbook shown as Source for freight HTML tab mirrors (published weekly dashboard). */
const FREIGHT_DASHBOARD_SOURCE =
  "DataDrops\\Everde_Freight_Dashboard_2026-05-28.xlsx";

/**
 * Weekly retail drop on DataDrops (five pipeline output workbooks).
 * Legacy deliverables may also live under `West Coast Retail Opportunity\` on JS Files.
 */
const RETAIL_DROP_FOLDER = "SalesOpportunity";
const RETAIL_WEEKLY_SOURCE = `${RETAIL_DROP_FOLDER}\\Sales Manager Summary - Wk21 2026.xlsx`;

/** Weather dashboard + crosswalk (daily pipeline on share). */
const WEATHER_DATA_ROOT = "Weather Data";

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
  /**
   * When set, this report renders the freight HTML embed (`/api/freight/dashboard-html`)
   * and calls the iframe `activate(tab)` with this exact tab name (must match `data-tab` in the HTML).
   */
  freightHtmlTab?: string;
  /**
   * When set, renders the NOR CAL sales plan HTML embed (`/api/sales-plan/dashboard-html`)
   * and calls iframe `activate(tab)` with this dashboard nav title.
   */
  salesPlanHtmlTab?: string;
  /**
   * When set, renders the West Coast retail HTML embed (`/api/retail/dashboard-html`)
   * and calls iframe `activate(tab)` with this nav title.
   */
  retailHtmlTab?: string;
  /**
   * When set, renders the weather HTML embed (`/api/weather/dashboard-html`)
   * and calls iframe `activate(tab)` with this nav title.
   */
  weatherHtmlTab?: string;
  /** Optional hex color (no #) for a small sidebar dot, matching dashboard tab colors */
  navAccent?: string;
  /**
   * When set, sidebar links here instead of `/{sectionId}/{slug}` (e.g. Main → freight tab routes).
   * `/main/...` still resolves for redirects.
   */
  navHref?: string;
  /** When true, omitted from sidebar under this section (routes still work; e.g. Main links here). */
  hideFromNav?: boolean;
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
  /**
   * When true, sidebar omits the gold "N." index (e.g. Main with Cover / Exec Summary only).
   * Numbered sections after this still count 1, 2, 3… in display order among non-omitted sections.
   */
  omitSectionNumber?: boolean;
  /**
   * When `sectionOnly` and set, `/[id]` serves the nursery analytics HTML embed (supply vs demand pane).
   * Source path is used for ReportShell “Source” only; dashboard data is embedded in the HTML file.
   */
  nurseryPane?: "supply" | "demand";
  /** Workbook path under DATA_ROOT_UNC for shell metadata (nursery sections). */
  sectionSourceRelativePath?: string;
  sectionNotes?: string;
  reports: PortalReport[];
};

/** Section-only route that embeds nursery-inventory-dashboard.html (supply or demand tab). */
export function isNurserySectionOnly(
  section: PortalSection,
): section is PortalSection & {
  nurseryPane: "supply" | "demand";
  sectionSourceRelativePath: string;
} {
  return (
    section.sectionOnly === true &&
    (section.nurseryPane === "supply" || section.nurseryPane === "demand") &&
    typeof section.sectionSourceRelativePath === "string" &&
    section.sectionSourceRelativePath.length > 0
  );
}

/** Synthetic report for ReportShell on nursery section-only pages. */
export function nurserySectionShellReport(
  section: PortalSection & {
    nurseryPane: "supply" | "demand";
    sectionSourceRelativePath: string;
  },
): PortalReport {
  return {
    slug: "overview",
    title: section.title,
    sourceRelativePath: section.sectionSourceRelativePath,
    notes: section.sectionNotes,
  };
}

/** Gold index shown next to numbered sections (skips `omitSectionNumber`). */
export function getSectionNumberPrefix(section: PortalSection): string | null {
  if (section.omitSectionNumber) return null;
  let n = 0;
  for (const s of PORTAL_SECTIONS) {
    if (!s.omitSectionNumber) n += 1;
    if (s.id === section.id) return `${n}.`;
  }
  return null;
}

/** 1-based index among numbered sections only (for home “Section N” labels). */
export function getSectionDisplayNumber(section: PortalSection): number | null {
  if (section.omitSectionNumber) return null;
  let n = 0;
  for (const s of PORTAL_SECTIONS) {
    if (!s.omitSectionNumber) n += 1;
    if (s.id === section.id) return n;
  }
  return null;
}

export const PORTAL_SECTIONS: PortalSection[] = [
  {
    id: "main",
    title: "Main",
    summary: "Freight dashboard cover and executive summary (same HTML as Load Board tabs).",
    shareFolder: "Freight",
    omitSectionNumber: true,
    reports: [
      {
        slug: "cover",
        title: "Cover",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Cover",
        navAccent: "2F5233",
        navHref: "/load-board-freight/freight-tab-cover",
      },
      {
        slug: "exec-summary",
        title: "Exec Summary",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Exec Summary",
        navAccent: "C49B3F",
        navHref: "/load-board-freight/freight-tab-exec-summary",
      },
    ],
  },
  {
    id: "retail-sales-opportunity",
    title: "Retail Sales Opportunity",
    summary:
      "West Coast retail opportunity, variance, and miss analysis with weather-informed context.",
    shareFolder: RETAIL_DROP_FOLDER,
    sectionNotes:
      "Drop the five weekly pipeline outputs here (Sales Manager Summary, HD/LOW variance, miss analysis, FOR source). Run npm run retail:extract-publish after each drop.",
    reports: [
      {
        slug: "west-coast-retail-dashboard",
        title: "West Coast Retail Dashboard",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        notes:
          "Primary 10-tab HTML embed. JSON via extract_retail_opp.py → Blob or public/retail_opp_data.json.",
        hideFromNav: true,
      },
      {
        slug: "retail-exec-summary",
        title: "Exec Summary",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "Exec Summary",
        navAccent: "2F5233",
      },
      {
        slug: "retail-region-comparison",
        title: "Region Comparison",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "Region Comparison",
        navAccent: "1F3A5F",
      },
      {
        slug: "retail-top-ship-now",
        title: "Top 30 Ship-Now",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "Top 30 Ship-Now",
        navAccent: "2F5233",
      },
      {
        slug: "retail-top-behind-plan",
        title: "Top 30 Behind Plan",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "Top 30 Behind Plan",
        navAccent: "C0392B",
      },
      {
        slug: "retail-top-stores",
        title: "All Stores",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "All Stores",
        navAccent: "C49B3F",
      },
      {
        slug: "retail-hd-detail",
        title: "HD Detail",
        sourceRelativePath: `${RETAIL_DROP_FOLDER}\\HD Sales Variance & Allocation - Wk21 2026.xlsx`,
        retailHtmlTab: "HD Detail",
        navAccent: "C49B3F",
      },
      {
        slug: "retail-lowes-detail",
        title: "Lowes Detail",
        sourceRelativePath: `${RETAIL_DROP_FOLDER}\\LOW Sales Variance & Allocation - Wk21 2026.xlsx`,
        retailHtmlTab: "Lowes Detail",
        navAccent: "1F3A5F",
      },
      {
        slug: "retail-for-source-miss",
        title: "FOR Source Miss",
        sourceRelativePath: `${RETAIL_DROP_FOLDER}\\FOR Source Miss Report - Wk21 2026.xlsx`,
        retailHtmlTab: "FOR Source Miss",
        navAccent: "5B4F8A",
      },
      {
        slug: "retail-miss-analysis",
        title: "Item-Level Miss Analysis",
        sourceRelativePath: `${RETAIL_DROP_FOLDER}\\Wk20 Item-Level Miss Analysis - Wk21 2026.xlsx`,
        retailHtmlTab: "Wk13 Miss Analysis",
        navAccent: "404040",
      },
      {
        slug: "retail-sales-weather",
        title: "Sales × Weather",
        sourceRelativePath: RETAIL_WEEKLY_SOURCE,
        retailHtmlTab: "Sales × Weather",
        navAccent: "5B4F8A",
        notes: "Uses sales–weather crosswalk from the Weather Data pipeline.",
      },
      {
        slug: "weather-region-overview",
        title: "Weather — Region Overview",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "Region Overview",
        navAccent: "2F5233",
        notes: "Live Open-Meteo forecast in browser; crosswalk JSON from daily pipeline.",
      },
      {
        slug: "weather-7-day-forecast",
        title: "Weather — 7-Day Forecast",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "7-Day Forecast",
        navAccent: "1F3A5F",
      },
      {
        slug: "weather-nca",
        title: "Weather — N. California",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "N. California",
        navAccent: "2F5233",
      },
      {
        slug: "weather-sca",
        title: "Weather — S. California",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "S. California",
        navAccent: "C49B3F",
      },
      {
        slug: "weather-ntx",
        title: "Weather — N. Texas",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "N. Texas",
        navAccent: "1F3A5F",
      },
      {
        slug: "weather-stx",
        title: "Weather — S. Texas",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "S. Texas",
        navAccent: "5B4F8A",
      },
      {
        slug: "weather-florida",
        title: "Weather — Florida",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "Florida",
        navAccent: "C0392B",
      },
      {
        slug: "weather-colorado",
        title: "Weather — Colorado",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\Sales Data`,
        weatherHtmlTab: "Colorado",
        navAccent: "404040",
      },
      {
        slug: "weather-sales-crosswalk",
        title: "Weather — Sales × Weather",
        sourceRelativePath: `${WEATHER_DATA_ROOT}\\shared`,
        weatherHtmlTab: "Sales × Weather",
        navAccent: "5B4F8A",
      },
      {
        slug: "freight-top-opportunities",
        title: "Top Opportunities",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Top Opportunities",
        navAccent: "C0392B",
        notes: "Freight dashboard tab opened here for executive retail context.",
      },
      {
        slug: "freight-top-opportunities-last-week",
        title: "Top Opportunities — Last Week",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Top Opportunities — Last Week",
        navAccent: "C0392B",
        notes: "Freight dashboard tab; em dash must match the HTML `data-tab` label.",
      },
      {
        slug: "freight-sales-performance",
        title: "Sales Performance",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Sales Performance",
        navAccent: "C49B3F",
        notes: "Freight dashboard tab (lane-level sales performance).",
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
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "Exec Summary",
        navAccent: "2F5233",
        sheetTabs: [
          "Read Me & Methodology",
          "Build Health",
          "Changes",
          "Exec Summary",
          "Plan by KI",
        ],
        notes:
          "Live NOR CAL dashboard (Blob JSON + HTML embed). Two-stage allocation on Read Me.",
      },
      {
        slug: "nor-cal-ytd-performance",
        title: "YTD Performance",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "YTD Performance",
        navAccent: "1F3A5F",
      },
      {
        slug: "nor-cal-miss-by-ki",
        title: "Miss by KI",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "Miss by KI",
        navAccent: "C0392B",
      },
      {
        slug: "nor-cal-plan-by-ki",
        title: "Plan by KI",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "Plan by KI",
        navAccent: "C49B3F",
      },
      {
        slug: "nor-cal-excess-at-farm",
        title: "Excess at Farm",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "Excess at Farm",
        navAccent: "5B4F8A",
      },
      {
        slug: "nor-cal-channel-summary",
        title: "Channel Summary",
        sourceRelativePath:
          "Sales Plan Review\\NOR CAL Forward Looking INV vs Sales Plan 051126.xlsx",
        salesPlanHtmlTab: "Channel Summary",
        navAccent: "404040",
      },
      {
        slug: "or-forward-looking-ytd",
        title: "OR Forward Looking YTD Miss vs Inventory",
        sourceRelativePath:
          "Sales Plan Review\\OR_Forward_Looking_YTD_Miss_vs_Inventory_052126.xlsx",
        navAccent: "2F5233",
        notes:
          "Oregon workbook not on share yet — shows rollout status until build_or_workbook_patched.py + extract --region OR.",
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
        slug: "everde-freight-dashboard",
        title: "Everde Freight Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        notes:
          "Primary HTML embed with Run pipeline. Cover and Exec Summary are under Main (same tabs).",
      },
      {
        slug: "freight-tab-cover",
        title: "Cover",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Cover",
        navAccent: "2F5233",
        hideFromNav: true,
      },
      {
        slug: "freight-tab-exec-summary",
        title: "Exec Summary",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Exec Summary",
        navAccent: "C49B3F",
        hideFromNav: true,
      },
      {
        slug: "freight-tab-n-ca-dashboard",
        title: "N. CA Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "N. CA Dashboard",
        navAccent: "1F3A5F",
      },
      {
        slug: "freight-tab-s-ca-dashboard",
        title: "S. CA Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "S. CA Dashboard",
        navAccent: "1F3A5F",
      },
      {
        slug: "freight-tab-tx-dashboard",
        title: "TX Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "TX Dashboard",
        navAccent: "1F3A5F",
      },
      {
        slug: "freight-tab-fl-dashboard",
        title: "FL Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "FL Dashboard",
        navAccent: "1F3A5F",
      },
      {
        slug: "freight-tab-for-dashboard",
        title: "FOR Dashboard",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "FOR Dashboard",
        navAccent: "1F3A5F",
      },
      {
        slug: "freight-tab-site-region-analysis",
        title: "Site & Region Analysis",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Site & Region Analysis",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-trailer-trip-analysis",
        title: "Trailer & Trip Analysis",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Trailer & Trip Analysis",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-3rd-party-analysis",
        title: "3rd Party Analysis",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "3rd Party Analysis",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-internal-freight-analysis",
        title: "Internal Freight Analysis",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Internal Freight Analysis",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-variance-drivers",
        title: "Variance Drivers",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Variance Drivers",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-pivot-playground",
        title: "Pivot Playground",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Pivot Playground",
        navAccent: "404040",
      },
      {
        slug: "freight-tab-lane-recovery",
        title: "Lane Recovery",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Lane Recovery",
        navAccent: "C49B3F",
      },
      {
        slug: "freight-tab-fuel-cost",
        title: "Fuel Cost",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Fuel Cost",
        navAccent: "5B4F8A",
      },
      {
        slug: "freight-tab-pricing-adjustments",
        title: "Pricing Adjustments",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Pricing Adjustments",
        navAccent: "7B5EA7",
      },
      {
        slug: "freight-tab-reference",
        title: "Reference",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Reference",
        navAccent: "BFBFBF",
      },
      {
        slug: "freight-tab-build-health",
        title: "Build Health",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Build Health",
        navAccent: "556070",
        notes: "Pipeline audit: source file, verify gate, BUD rates, headline KPIs.",
      },
      {
        slug: "freight-tab-change-log",
        title: "Change Log",
        sourceRelativePath: FREIGHT_DASHBOARD_SOURCE,
        freightHtmlTab: "Change Log",
        navAccent: "556070",
        notes: "Newest-first history from change_history.json.",
      },
      {
        slug: "3p-top5-lanes-carrier-analysis",
        title: "3P Top 5 Lanes — Carrier Cost Analysis",
        hideFromNav: true,
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
        slug: "everde-freight-data-ytd",
        title: "Everde Freight Data (YTD)",
        hideFromNav: true,
        sourceRelativePath:
          "Everde Freight Data YTD 5-09-26 with MAR-26 Rates with adj 26 BUD YE COSTS.xlsb",
        notes:
          "Large binary workbook — candidate for warehouse / parquet in a later phase.",
      },
      {
        slug: "pricing-file-total-adjustments",
        title: "Pricing File — Total Adjustments",
        hideFromNav: true,
        sourceRelativePath:
          "Freight\\Pricing File - Total Adjustments rev.05052026.xlsx",
      },
      {
        slug: "legacy-html-dashboard",
        title: "Legacy HTML Dashboard (reference)",
        hideFromNav: true,
        sourceRelativePath: "Freight\\Everde_Freight_Dashboard_2026-05-04.html",
        notes:
          "Prior HTML export; useful for visual parity while rebuilding charts in React.",
      },
    ],
  },
  {
    id: "supply-inventory",
    title: "Supply Inventory",
    summary:
      "Price-list and saleable inventory views for nursery operations (weekly drops on the share).",
    shareFolder: "SalesInventoryPriceList",
    sectionOnly: true,
    nurseryPane: "supply",
    sectionSourceRelativePath:
      "SalesInventoryPriceList\\Sales_Inventory___Price_List_060526.xls",
    sectionNotes:
      "Drop the latest Sales / Inventory / Price List workbook here; filenames rotate weekly.",
    reports: [],
  },
  {
    id: "production-demand-plan",
    title: "Production & Demand Plan",
    summary:
      "Inventory metrics versus demand windows and plans (weekly drops on the share).",
    shareFolder: "Inventory Metrics",
    sectionOnly: true,
    nurseryPane: "demand",
    sectionSourceRelativePath:
      "Inventory Metrics\\Inventory Metrics 06 08 26.xlsb",
    sectionNotes:
      "Drop the latest Inventory Metrics workbook in Inventory Metrics (run npm run nursery:refresh-demand after each drop).",
    reports: [],
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
