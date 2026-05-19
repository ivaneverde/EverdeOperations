import { promises as fs } from "fs";
import path from "path";
import {
  downloadWeatherDashboardJsonFromBlob,
  downloadWeatherDashboardJsonFromLocal,
} from "@/lib/azure/weatherDashboardBlob";
import { extractInlineConstJson } from "@/lib/embed/extractInlineConstJson";
import { resolveWeatherDashboardHtmlPath } from "@/lib/resolveWeatherDashboardHtmlPath";

export type WeatherJsonSource = "azure-blob" | "local-file" | "html-embed";

export async function loadWeatherDashboardJson(): Promise<{
  json: string;
  source: WeatherJsonSource;
} | null> {
  const fromBlob = await downloadWeatherDashboardJsonFromBlob();
  if (fromBlob) return { json: fromBlob, source: "azure-blob" };

  const fromLocal = await downloadWeatherDashboardJsonFromLocal();
  if (fromLocal) return { json: fromLocal, source: "local-file" };

  const resolved = await resolveWeatherDashboardHtmlPath();
  const htmlCandidates = [
    resolved.path,
    path.join(process.cwd(), "public", "Everde_Weather_Dashboard.html"),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  for (const htmlPath of htmlCandidates) {
    if (seen.has(htmlPath)) continue;
    seen.add(htmlPath);
    try {
      const html = await fs.readFile(htmlPath, "utf8");
      const json = extractInlineConstJson(html, "WX");
      if (json) return { json, source: "html-embed" };
    } catch {
      /* try next */
    }
  }

  return null;
}
