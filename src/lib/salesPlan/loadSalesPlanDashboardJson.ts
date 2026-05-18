import { promises as fs } from "fs";
import path from "path";
import {
  downloadSalesPlanDashboardJsonFromBlob,
  downloadSalesPlanDashboardJsonFromLocal,
} from "@/lib/azure/salesPlanDashboardBlob";
import { resolveSalesPlanDashboardHtmlPath } from "@/lib/resolveSalesPlanDashboardHtmlPath";
import { extractSalesPlanInlineJson } from "@/lib/salesPlan/extractInlineJson";

export type SalesPlanJsonSource =
  | "azure-blob"
  | "local-file"
  | "html-embed";

export async function loadSalesPlanDashboardJson(): Promise<{
  json: string;
  source: SalesPlanJsonSource;
} | null> {
  const fromBlob = await downloadSalesPlanDashboardJsonFromBlob();
  if (fromBlob) return { json: fromBlob, source: "azure-blob" };

  const fromLocal = await downloadSalesPlanDashboardJsonFromLocal();
  if (fromLocal) return { json: fromLocal, source: "local-file" };

  const resolved = await resolveSalesPlanDashboardHtmlPath();
  const htmlCandidates = [
    resolved.path,
    path.join(process.cwd(), "public", "Everde_NOR_CAL_Sales_Plan_Dashboard.html"),
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
