/**
 * Serves Everde_Freight_Dashboard*.html: explicit env, then newest by mtime in
 * public/ or PORTAL_DATA_ROOT/Freight. See scripts/freight/FREIGHT_DASHBOARD_DATA.md.
 */
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { replaceInlineFreightDataWithApiFetch } from "@/lib/freightDashboardHtmlPhaseC";
import { resolveFreightDashboardHtmlPath } from "@/lib/resolveFreightDashboardHtmlPath";

export const dynamic = "force-dynamic";

/**
 * Legacy grid HTML used `aside.sidebar` + `body .layout`. The YTD static export uses
 * `#sidebar` + `#app` + `#main`. Hide inner nav in both; keep one scrollport on main.
 */
const IFRAME_EMBED_STYLES = `<style data-everde-portal="freight-embed">
html,body{
  overflow-x:hidden!important;
  max-width:100%!important;
  width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}
/* Legacy workbook-export layout */
aside.sidebar{display:none!important}
body .layout{
  grid-template-columns:1fr!important;
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
/* YTD single-file layout (nav#sidebar + main#main) */
#sidebar{display:none!important;width:0!important;min-width:0!important;margin:0!important;padding:0!important;border:none!important;overflow:hidden!important}
#app{display:flex!important;min-height:100%!important;height:100%!important}
#main{
  flex:1 1 auto!important;
  min-width:0!important;
  width:100%!important;
  max-width:100%!important;
  overflow-y:auto!important;
  overflow-x:hidden!important;
  box-sizing:border-box;
}
</style>`;

/** Maps `freightHtmlTab` from portal.ts to `showTab(id)` ids inside the static HTML. */
const PORTAL_FREIGHT_ACTIVATE_BRIDGE = `<script data-everde-portal="activate-bridge">
(function(){
  var M={
    "Cover":"cover",
    "Exec Summary":"exec",
    "N. CA Dashboard":"nca",
    "S. CA Dashboard":"sca",
    "TX Dashboard":"tx",
    "FL Dashboard":"fl",
    "FOR Dashboard":"for",
    "Site & Region Analysis":"site-region",
    "Trailer & Trip Analysis":"trailer",
    "3rd Party Analysis":"thirdparty",
    "Internal Freight Analysis":"trailer",
    "Variance Drivers":"variance",
    "Pivot Playground":"pivot",
    "Top Opportunities":"opportunities",
    "Top Opportunities — Last Week":"opportunities",
    "Sales Performance":"sales",
    "Lane Recovery":"lane",
    "Fuel Cost":"fuel",
    "Pricing Adjustments":"variance",
    "Reference":"masterdata"
  };
  window.__everdeFreightActivateQueue=window.__everdeFreightActivateQueue||[];
  window.activate=function(name){
    var run=function(){
      var id=M[name]||M[String(name||"").trim()]||"cover";
      if(typeof showTab==="function")showTab(id);
    };
    if(window.__everdeFreightDataReady){ run(); return; }
    window.__everdeFreightActivateQueue.push(run);
  };
})();` +
  `</script>`;

function injectFreightPortalEmbeds(html: string): string {
  const withViewport = ensureViewportMeta(html);
  const headBundle = IFRAME_EMBED_STYLES;
  const headClose = /<\/head\s*>/i.exec(withViewport);
  let out =
    headClose && headClose.index >= 0
      ? withViewport.slice(0, headClose.index) +
        headBundle +
        withViewport.slice(headClose.index)
      : headBundle + withViewport;

  const bodyClose = /<\/body\s*>/i.exec(out);
  if (bodyClose && bodyClose.index >= 0) {
    out =
      out.slice(0, bodyClose.index) +
      PORTAL_FREIGHT_ACTIVATE_BRIDGE +
      out.slice(bodyClose.index);
  } else {
    out += PORTAL_FREIGHT_ACTIVATE_BRIDGE;
  }
  return out;
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
    const phaseC =
      process.env.FREIGHT_DASHBOARD_HTML_USE_INLINE_D === "1"
        ? raw
        : replaceInlineFreightDataWithApiFetch(raw);
    const html = injectFreightPortalEmbeds(phaseC);
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
