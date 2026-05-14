import { promises as fs } from "fs";
import path from "path";
import { freightDirectory, joinPortalDataRoot } from "@/lib/sharePaths";

const DASHBOARD_HTML_RE = /^Everde_Freight_Dashboard.*\.html$/i;

async function newestInDirectory(
  dir: string,
): Promise<{ full: string; mtime: number } | null> {
  const entries: { full: string; mtime: number }[] = [];
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!DASHBOARD_HTML_RE.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fs.stat(full);
      if (st.isFile()) entries.push({ full, mtime: st.mtimeMs });
    } catch {
      /* skip */
    }
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.mtime - a.mtime);
  return entries[0]!;
}

/**
 * Resolves which static freight dashboard HTML to serve.
 *
 * 1. `FREIGHT_DASHBOARD_HTML` — exact file (local testing or pinned path).
 * 2. Otherwise newest `Everde_Freight_Dashboard*.html` by `mtime` among:
 *    - `public/` (repo / local drop, e.g. Claude export before copying to the share)
 *    - `PORTAL_DATA_ROOT/Freight/` (canonical share location)
 */
export async function resolveFreightDashboardHtmlPath(): Promise<{
  path: string | null;
  searchedSummary: string;
}> {
  const explicit = process.env.FREIGHT_DASHBOARD_HTML?.trim();
  if (explicit) {
    const p = explicit.replace(/\\/g, "/");
    try {
      await fs.access(p);
      return {
        path: p,
        searchedSummary: `Using FREIGHT_DASHBOARD_HTML (${p}).`,
      };
    } catch {
      return {
        path: null,
        searchedSummary: `FREIGHT_DASHBOARD_HTML is set but not readable: ${p}`,
      };
    }
  }

  const publicDir = path.join(process.cwd(), "public");
  const freightDir = freightDirectory();

  const fromPublic = await newestInDirectory(publicDir);
  const fromShare: { full: string; mtime: number }[] = [];
  try {
    const names = await fs.readdir(freightDir);
    for (const name of names) {
      if (!DASHBOARD_HTML_RE.test(name)) continue;
      const full = joinPortalDataRoot("Freight", name);
      try {
        const st = await fs.stat(full);
        if (st.isFile()) fromShare.push({ full, mtime: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* share unreachable */
  }
  fromShare.sort((a, b) => b.mtime - a.mtime);
  const shareBest = fromShare[0] ?? null;

  const candidates = [fromPublic, shareBest].filter(
    (x): x is { full: string; mtime: number } => x != null,
  );
  candidates.sort((a, b) => b.mtime - a.mtime);
  const best = candidates[0] ?? null;

  const parts = [
    `public/: ${fromPublic ? fromPublic.full : "(no match)"}`,
    `Freight/: ${shareBest ? shareBest.full : "(no match or unreadable)"}`,
  ];

  return {
    path: best?.full ?? null,
    searchedSummary: parts.join(" · "),
  };
}
