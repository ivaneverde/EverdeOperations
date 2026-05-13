/**
 * Serves the newest Everde_Freight_Dashboard*.html from PORTAL_DATA_ROOT/Freight.
 * KPI correctness depends on how that HTML was built from the workbook; see
 * scripts/freight/FREIGHT_DASHBOARD_DATA.md (hidden backend tabs, not display formulas).
 */
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { freightDirectory, joinPortalDataRoot } from "@/lib/sharePaths";

export const dynamic = "force-dynamic";

const DASHBOARD_HTML_RE = /^Everde_Freight_Dashboard.*\.html$/i;

/** Hide duplicate inner nav when the HTML is embedded in the portal iframe (Option B). */
const IFRAME_INNER_NAV_HIDE_STYLE = `<style data-everde-portal="hide-inner-nav">aside.sidebar{display:none!important}body .layout{grid-template-columns:1fr!important}</style>`;

function injectHideInnerNav(html: string): string {
  const m = /<\/head\s*>/i.exec(html);
  if (m && m.index >= 0) {
    return html.slice(0, m.index) + IFRAME_INNER_NAV_HIDE_STYLE + html.slice(m.index);
  }
  return IFRAME_INNER_NAV_HIDE_STYLE + html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlNotFoundBody(message: string, searchedFreightDir: string): string {
  const dir = escapeHtml(searchedFreightDir);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Freight dashboard</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>${escapeHtml(message)}</strong></p><p style="color:#555;font-size:14px">Searched: <code style="word-break:break-all">${dir}</code></p><p style="color:#555;font-size:14px">The dashboard HTML must sit in this <strong>Freight</strong> folder (next to <code>_pipeline</code>), <em>not</em> inside <code>_pipeline</code>. The file name must match <code>Everde_Freight_Dashboard*.html</code> (for example <code>Everde_Freight_Dashboard_2026-05-04.html</code>).</p><p style="color:#555;font-size:14px">Run <code>python update.py</code> from <code>Freight/_pipeline</code> (or enable <code>FREIGHT_ALLOW_PIPELINE=1</code> and use the portal &quot;Run pipeline&quot; button), then reload.</p></body></html>`;
}

async function resolveDashboardHtmlPath(): Promise<string | null> {
  const explicit = process.env.FREIGHT_DASHBOARD_HTML?.trim();
  if (explicit) {
    const p = explicit.replace(/\\/g, "/");
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }

  const freightDir = freightDirectory();
  const entries: { name: string; mtime: number; full: string }[] = [];
  try {
    const names = await fs.readdir(freightDir);
    for (const name of names) {
      if (!DASHBOARD_HTML_RE.test(name)) continue;
      const full = joinPortalDataRoot("Freight", name);
      try {
        const st = await fs.stat(full);
        if (st.isFile()) {
          entries.push({ name, mtime: st.mtimeMs, full });
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    return null;
  }

  if (entries.length === 0) return null;
  entries.sort((a, b) => b.mtime - a.mtime);
  return entries[0]!.full;
}

export async function GET() {
  const searchedFreightDir = freightDirectory();
  const filePath = await resolveDashboardHtmlPath();
  if (!filePath) {
    return new NextResponse(
      htmlNotFoundBody("No Everde_Freight_Dashboard*.html file found.", searchedFreightDir),
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const html = injectHideInnerNav(raw);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Freight-Dashboard-Path": filePath,
      },
    });
  } catch {
    return new NextResponse(
      htmlNotFoundBody(`Could not read: ${filePath}`, searchedFreightDir),
      {
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
