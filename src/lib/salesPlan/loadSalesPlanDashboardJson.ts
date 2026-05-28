import { promises as fs } from "fs";
import path from "path";
import {
  downloadSalesPlanDashboardJsonFromBlob,
  downloadSalesPlanDashboardJsonFromLocal,
} from "@/lib/azure/salesPlanDashboardBlob";
import { resolveSalesPlanDashboardHtmlPath } from "@/lib/resolveSalesPlanDashboardHtmlPath";
import { extractSalesPlanInlineJson } from "@/lib/salesPlan/extractInlineJson";
import type { SalesPlanRegion } from "@/lib/salesPlan/regionConfig";
import { SALES_PLAN_REGION_CONFIG } from "@/lib/salesPlan/regionConfig";

export type SalesPlanJsonSource =
  | "azure-blob"
  | "local-file"
  | "html-embed";

export async function loadSalesPlanDashboardJson(
  region: SalesPlanRegion = "nor-cal",
): Promise<{
  json: string;
  source: SalesPlanJsonSource;
} | null> {
  const cfg = SALES_PLAN_REGION_CONFIG[region];
  const fromBlob = await downloadSalesPlanDashboardJsonFromBlob(region);
  if (fromBlob) return { json: fromBlob, source: "azure-blob" };

  const fromLocal = await downloadSalesPlanDashboardJsonFromLocal(region);
  if (fromLocal) return { json: fromLocal, source: "local-file" };

  const resolved = await resolveSalesPlanDashboardHtmlPath(region);
  const htmlCandidates = [
    resolved.path,
    path.join(process.cwd(), "public", cfg.htmlBasename),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  for (const htmlPath of htmlCandidates) {
    if (seen.has(htmlPath)) continue;
    seen.add(htmlPath);
    try {
      const html = await fs.readFile(htmlPath, "utf8");
      const json = extractSalesPlanInlineJson(html);
      if (json) return { json, source: "html-embed" };
    } catch {
      /* try next */
    }
  }

  return null;
}
