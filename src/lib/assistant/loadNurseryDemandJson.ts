import { promises as fs } from "fs";
import path from "path";

const DEMAND_NEEDLE = "const DEMAND = JSON.parse(`";

/** Extract embedded DEMAND JSON from nursery-inventory-dashboard.html. */
export function extractDemandJsonFromHtml(html: string): string | null {
  const start = html.indexOf(DEMAND_NEEDLE);
  if (start < 0) return null;
  const jsonStart = start + DEMAND_NEEDLE.length;
  const close = html.indexOf("`)", jsonStart);
  if (close < 0) return null;
  const raw = html.slice(jsonStart, close).trim();
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

export async function loadNurseryDemandJson(): Promise<string | null> {
  const explicit = process.env.PUBLIC_NURSERY_DEMAND_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "nursery-demand-data.json"),
    path.join(process.cwd(), "public", "nursery-inventory-dashboard.html"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, "utf8");
      if (p.toLowerCase().endsWith(".html")) {
        return extractDemandJsonFromHtml(text);
      }
      JSON.parse(text);
      return text;
    } catch {
      /* try next */
    }
  }
  return null;
}
