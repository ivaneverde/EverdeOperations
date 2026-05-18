import { promises as fs } from "fs";
import path from "path";
import { DATA_ROOT_UNC } from "@/config/portal";

const HTML_BASENAME = "Everde_NOR_CAL_Sales_Plan_Dashboard.html";

async function newestByMtime(paths: string[]): Promise<string | null> {
  let best: { path: string; mtime: number } | null = null;
  for (const p of paths) {
    try {
      const st = await fs.stat(p);
      if (!st.isFile()) continue;
      const mtime = st.mtimeMs;
      if (!best || mtime > best.mtime) best = { path: p, mtime };
    } catch {
      /* skip */
    }
  }
  return best?.path ?? null;
}

async function globNewestInDir(dir: string, pattern: RegExp): Promise<string | null> {
  try {
    const names = await fs.readdir(dir);
    const hits = names
      .filter((n) => pattern.test(n))
      .map((n) => path.join(dir, n));
    return newestByMtime(hits);
  } catch {
    return null;
  }
}

/**
 * Resolve NOR CAL sales plan dashboard HTML: env pin, then public/, then DataDrops.
 */
export async function resolveSalesPlanDashboardHtmlPath(): Promise<{
  path: string | null;
  searchedSummary: string;
}> {
  const searched: string[] = [];

  const pinned = process.env.SALES_PLAN_DASHBOARD_HTML?.trim();
  if (pinned) {
    try {
      await fs.access(pinned);
      return { path: pinned, searchedSummary: `SALES_PLAN_DASHBOARD_HTML=${pinned}` };
    } catch {
      searched.push(`SALES_PLAN_DASHBOARD_HTML (missing): ${pinned}`);
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
  const shareDirs = [
    path.join(dataRoot, "Sales Plan Review"),
    path.join(dataRoot, "sales-plan-review"),
  ];

  for (const dir of shareDirs) {
    searched.push(`${dir}\\${HTML_BASENAME}`);
    const fromShare = await globNewestInDir(dir, /^Everde_NOR_CAL_Sales_Plan_Dashboard.*\.html$/i);
    if (fromShare) {
      return { path: fromShare, searchedSummary: searched.join("; ") };
    }
  }

  return { path: null, searchedSummary: searched.join("; ") };
}
