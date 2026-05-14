/**
 * Serves Everde_Freight_Dashboard*.html: explicit env, then newest by mtime in
 * public/ or PORTAL_DATA_ROOT/Freight. See scripts/freight/FREIGHT_DASHBOARD_DATA.md.
 */
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { resolveFreightDashboardHtmlPath } from "@/lib/resolveFreightDashboardHtmlPath";

export const dynamic = "force-dynamic";

/** Hide duplicate inner nav when the HTML is embedded in the portal iframe (Option B). */
const IFRAME_INNER_NAV_HIDE_STYLE = `<style data-everde-portal="hide-inner-nav">aside.sidebar{display:none!important}body .layout{grid-template-columns:1fr!important}</style>`;

/** Single horizontal scrollport on .layout; clip page edge; avoid nested x-auto fighting. */
const IFRAME_OVERFLOW_STYLE = `<style data-everde-portal="freight-overflow">
html,body{
  overflow-x:hidden!important;
  max-width:100%!important;
  width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}
body .layout{
  max-width:100%!important;
  width:100%!important;
  min-width:0!important;
  min-height:0!important;
  overflow-x:auto!important;
  overflow-y:auto!important;
  box-sizing:border-box;
  overscroll-behavior-x:contain;
}
body .layout > *{
  min-width:0!important;
  max-width:100%!important;
  overflow-x:visible!important;
}
</style>`;

function injectHideInnerNav(html: string): string {
  const withViewport = ensureViewportMeta(html);
  const bundle = IFRAME_OVERFLOW_STYLE + IFRAME_INNER_NAV_HIDE_STYLE;
  const m = /<\/head\s*>/i.exec(withViewport);
  if (m && m.index >= 0) {
    return withViewport.slice(0, m.index) + bundle + withViewport.slice(m.index);
  }
  return bundle + withViewport;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlNotFoundBody(message: string, detail: string): string {
  const d = escapeHtml(detail);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Freight dashboard</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>${escapeHtml(message)}</strong></p><p style="color:#555;font-size:14px">${d}</p><p style="color:#555;font-size:14px">Use the <strong>newest</strong> <code>Everde_Freight_Dashboard*.html</code> in <code>public/</code> (repo) or under <code>DataDrops/Freight/</code> on the share, or set <code>FREIGHT_DASHBOARD_HTML</code> in <code>.env.local</code> to a full path. Files must sit next to workbooks in <strong>Freight</strong>, not inside <code>_pipeline</code>.</p><p style="color:#555;font-size:14px">Run <code>python update.py</code> from <code>Freight/_pipeline</code> (or enable <code>FREIGHT_ALLOW_PIPELINE=1</code> and use &quot;Run pipeline&quot;), then reload.</p></body></html>`;
}

export async function GET() {
  const { path: filePath, searchedSummary } =
    await resolveFreightDashboardHtmlPath();
  if (!filePath) {
    return new NextResponse(
      htmlNotFoundBody("No Everde_Freight_Dashboard*.html file found.", searchedSummary),
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
      htmlNotFoundBody(`Could not read: ${filePath}`, searchedSummary),
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
