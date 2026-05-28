import { promises as fs } from "fs";
import path from "path";
import { DATA_ROOT_UNC } from "@/config/portal";
import type { SalesPlanRegion } from "@/lib/salesPlan/regionConfig";
import { SALES_PLAN_REGION_CONFIG } from "@/lib/salesPlan/regionConfig";

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
 * Resolve sales plan dashboard HTML: env pin, then public/, then DataDrops.
 */
export async function resolveSalesPlanDashboardHtmlPath(
  region: SalesPlanRegion = "nor-cal",
): Promise<{
  path: string | null;
  searchedSummary: string;
}> {
  const cfg = SALES_PLAN_REGION_CONFIG[region];
  const searched: string[] = [];

  const pinnedEnv =
    region === "or"
      ? process.env.OR_SALES_PLAN_DASHBOARD_HTML?.trim()
      : process.env.SALES_PLAN_DASHBOARD_HTML?.trim();
  if (pinnedEnv) {
    try {
      await fs.access(pinnedEnv);
      return { path: pinnedEnv, searchedSummary: `pinned=${pinnedEnv}` };
    } catch {
      searched.push(`pinned HTML (missing): ${pinnedEnv}`);
    }
  }

  const publicPath = path.join(process.cwd(), "public", cfg.htmlBasename);
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
    searched.push(`${dir}\\${cfg.htmlBasename}`);
    const fromShare = await globNewestInDir(dir, cfg.shareHtmlPattern);
    if (fromShare) {
      return { path: fromShare, searchedSummary: searched.join("; ") };
    }
  }

  return { path: null, searchedSummary: searched.join("; ") };
}
