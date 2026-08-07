import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  wcroDashboardJsonPath,
} from "../azure/blobPaths.js";

/**
 * Load WCRO extract JSON — Blob first, then local repo/public fallbacks.
 */
export async function loadWcroJsonRaw(): Promise<string | null> {
  const fromBlob = await downloadJsonFromBlob(
    freightBlobContainer(),
    wcroDashboardJsonPath(),
  );
  if (fromBlob) return fromBlob;

  const envPath = process.env.WCRO_DATA_PATH?.trim();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    envPath,
    path.resolve(here, "../../../data/wcro_data.json"),
    path.resolve(here, "../../../public/wcro_data.json"),
    path.resolve(process.cwd(), "data/wcro_data.json"),
    path.resolve(process.cwd(), "../data/wcro_data.json"),
    path.resolve(process.cwd(), "../public/wcro_data.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      if (raw.includes("four_numbers")) return raw;
    } catch {
      /* try next */
    }
  }
  return null;
}
