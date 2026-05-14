import { promises as fs } from "fs";
import path from "path";

/**
 * Resolve `nursery-inventory-dashboard.html` for `GET /api/nursery/dashboard-html`.
 * Order: `NURSERY_DASHBOARD_HTML` → `%USERPROFILE%/Documents/` → `public/` copy.
 */
export async function resolveNurseryDashboardHtmlPath(): Promise<string | null> {
  const candidates: string[] = [];
  const env = process.env.NURSERY_DASHBOARD_HTML?.trim();
  if (env) {
    candidates.push(env.replace(/\//g, path.sep));
  }
  const profile = process.env.USERPROFILE || process.env.HOME;
  if (profile) {
    candidates.push(
      path.join(profile, "Documents", "nursery-inventory-dashboard.html"),
    );
  }
  candidates.push(
    path.join(process.cwd(), "public", "nursery-inventory-dashboard.html"),
  );
  for (const p of candidates) {
    try {
      const st = await fs.stat(p);
      if (st.isFile()) return p;
    } catch {
      /* try next */
    }
  }
  return null;
}
