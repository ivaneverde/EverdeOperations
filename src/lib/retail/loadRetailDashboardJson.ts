import { promises as fs } from "fs";
import path from "path";
import {
  downloadRetailDashboardJsonFromBlob,
  downloadRetailDashboardJsonFromLocal,
} from "@/lib/azure/retailDashboardBlob";
import { extractInlineConstJson } from "@/lib/embed/extractInlineConstJson";
import { normalizeRetailDashboardJson } from "@/lib/retail/normalizeRetailDashboardJson";
import { resolveRetailDashboardHtmlPath } from "@/lib/resolveRetailDashboardHtmlPath";

export type RetailJsonSource = "azure-blob" | "local-file" | "html-embed";

export async function loadRetailDashboardJson(): Promise<{
  json: string;
  source: RetailJsonSource;
} | null> {
  const normalize = (json: string) => normalizeRetailDashboardJson(json);

  const fromBlob = await downloadRetailDashboardJsonFromBlob();
  if (fromBlob) return { json: normalize(fromBlob), source: "azure-blob" };

  const fromLocal = await downloadRetailDashboardJsonFromLocal();
  if (fromLocal) return { json: normalize(fromLocal), source: "local-file" };

  const resolved = await resolveRetailDashboardHtmlPath();
  const htmlCandidates = [
    resolved.path,
    path.join(
      process.cwd(),
      "public",
      "Everde_West_Coast_Retail_Opportunity_Dashboard.html",
    ),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  for (const htmlPath of htmlCandidates) {
    if (seen.has(htmlPath)) continue;
    seen.add(htmlPath);
    try {
      const html = await fs.readFile(htmlPath, "utf8");
      const json = extractInlineConstJson(html, "D");
      if (json) return { json: normalize(json), source: "html-embed" };
    } catch {
      /* try next */
    }
  }

  return null;
}
