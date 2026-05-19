import { promises as fs } from "fs";
import path from "path";
import { DATA_ROOT_UNC } from "@/config/portal";

const HTML_BASENAME = "Everde_Weather_Dashboard.html";

async function globNewestInDir(dir: string, pattern: RegExp): Promise<string | null> {
  try {
    const names = await fs.readdir(dir);
    let best: { path: string; mtime: number } | null = null;
    for (const n of names) {
      if (!pattern.test(n)) continue;
      const p = path.join(dir, n);
      try {
        const st = await fs.stat(p);
        if (!st.isFile()) continue;
        if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs };
      } catch {
        /* skip */
      }
    }
    return best?.path ?? null;
  } catch {
    return null;
  }
}

export async function resolveWeatherDashboardHtmlPath(): Promise<{
  path: string | null;
  searchedSummary: string;
}> {
  const searched: string[] = [];

  const pinned = process.env.WEATHER_DASHBOARD_HTML?.trim();
  if (pinned) {
    try {
      await fs.access(pinned);
      return { path: pinned, searchedSummary: `WEATHER_DASHBOARD_HTML=${pinned}` };
    } catch {
      searched.push(`WEATHER_DASHBOARD_HTML (missing): ${pinned}`);
    }
  }

  const publicPath = path.join(process.cwd(), "public", HTML_BASENAME);
  searched.push(publicPath);
  try {
    await fs.access(publicPath);
    return { path: publicPath, searchedSummary: searched.join("; ") };
  } catch {
    /* continue */
  }

  const dataRoot =
    process.env.PORTAL_DATA_ROOT?.trim() ||
    process.env.DATA_ROOT?.trim() ||
    DATA_ROOT_UNC;
  const shareDir = path.join(dataRoot, "Weather Data");
  searched.push(`${shareDir}\\${HTML_BASENAME}`);
  const fromShare = await globNewestInDir(
    shareDir,
    /^Everde_Weather_Dashboard.*\.html$/i,
  );
  if (fromShare) {
    return { path: fromShare, searchedSummary: searched.join("; ") };
  }

  return { path: null, searchedSummary: searched.join("; ") };
}
