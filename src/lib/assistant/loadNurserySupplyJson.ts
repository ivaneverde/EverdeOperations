import { promises as fs } from "fs";
import path from "path";

const DATA_NEEDLE = "const DATA = ";

/** Extract embedded SUPPLY JSON from nursery-inventory-dashboard.html. */
export function extractSupplyJsonFromHtml(html: string): string | null {
  const start = html.indexOf(DATA_NEEDLE);
  if (start < 0) return null;
  const jsonStart = start + DATA_NEEDLE.length;
  if (html[jsonStart] !== "{") return null;

  let depth = 0;
  let inStr: string | null = null;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(jsonStart, i + 1).trim();
        try {
          JSON.parse(raw);
          return raw;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function loadNurserySupplyJson(): Promise<string | null> {
  const explicit = process.env.PUBLIC_NURSERY_SUPPLY_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "nursery-supply-data.json"),
    path.join(process.cwd(), "public", "nursery-inventory-dashboard.html"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, "utf8");
      if (p.toLowerCase().endsWith(".html")) {
        return extractSupplyJsonFromHtml(text);
      }
      JSON.parse(text);
      return text;
    } catch {
      /* try next */
    }
  }
  return null;
}
