import { promises as fs } from "fs";
import path from "path";
import type { WcroData } from "@/lib/wcro/types";

export type WcroJsonSource = "data-dir" | "public-file";

export async function loadWcroDataJson(): Promise<{
  data: WcroData;
  json: string;
  source: WcroJsonSource;
} | null> {
  const candidates: { path: string; source: WcroJsonSource }[] = [
    { path: path.join(process.cwd(), "data", "wcro_data.json"), source: "data-dir" },
    {
      path: path.join(process.cwd(), "public", "wcro_data.json"),
      source: "public-file",
    },
  ];

  for (const c of candidates) {
    try {
      const json = await fs.readFile(c.path, "utf8");
      const data = JSON.parse(json) as WcroData;
      if (!data?.four_numbers || !Array.isArray(data.rep_orders)) continue;
      return { data, json, source: c.source };
    } catch {
      /* try next */
    }
  }
  return null;
}
