export type SalesPlanRegion = "nor-cal" | "or";

export type SalesPlanRegionConfig = {
  htmlBasename: string;
  defaultBlobPath: string;
  blobEnvKey: string;
  localJsonBasename: string;
  localJsonEnvKey: string;
  dataApiPath: string;
  htmlApiPath: string;
  shareHtmlPattern: RegExp;
  metaRegion: string;
};

export const SALES_PLAN_REGION_CONFIG: Record<
  SalesPlanRegion,
  SalesPlanRegionConfig
> = {
  "nor-cal": {
    htmlBasename: "Everde_NOR_CAL_Sales_Plan_Dashboard.html",
    defaultBlobPath: "sales-plan/latest/sales_plan_data.json",
    blobEnvKey: "AZURE_SALES_PLAN_DASHBOARD_JSON_BLOB",
    localJsonBasename: "sales_plan_data.json",
    localJsonEnvKey: "PUBLIC_SALES_PLAN_DASHBOARD_JSON",
    dataApiPath: "/api/sales-plan/dashboard-data",
    htmlApiPath: "/api/sales-plan/dashboard-html",
    shareHtmlPattern: /^Everde_NOR_CAL_Sales_Plan_Dashboard.*\.html$/i,
    metaRegion: "NOR CAL",
  },
  or: {
    htmlBasename: "Everde_OR_Sales_Plan_Dashboard.html",
    defaultBlobPath: "sales-plan/or/latest/or_sales_plan_data.json",
    blobEnvKey: "AZURE_OR_SALES_PLAN_DASHBOARD_JSON_BLOB",
    localJsonBasename: "or_sales_plan_data.json",
    localJsonEnvKey: "PUBLIC_OR_SALES_PLAN_DASHBOARD_JSON",
    dataApiPath: "/api/sales-plan/or/dashboard-data",
    htmlApiPath: "/api/sales-plan/or/dashboard-html",
    shareHtmlPattern: /^Everde_OR_Sales_Plan_Dashboard.*\.html$/i,
    metaRegion: "OR",
  },
};

export function salesPlanRegionFromSlug(slug: string): SalesPlanRegion {
  if (slug.startsWith("or-") || slug === "or-forward-looking-ytd") return "or";
  return "nor-cal";
}
