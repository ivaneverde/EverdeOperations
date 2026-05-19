import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { replaceInlineRetailDataWithApiFetch } from "@/lib/retailDashboardHtmlPhaseC";
import { resolveRetailDashboardHtmlPath } from "@/lib/resolveRetailDashboardHtmlPath";

export const dynamic = "force-dynamic";

const IFRAME_EMBED_STYLES = `<style data-everde-portal="retail-embed">
html,body{
  overflow-x:hidden!important;
  max-width:100%!important;
  width:100%!important;
  min-width:0!important;
  box-sizing:border-box;
}
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

const PORTAL_RETAIL_ACTIVATE_BRIDGE = `<script data-everde-portal="retail-activate-bridge">
(function(){
  var M={
    "Exec Summary":"exec",
    "Region Comparison":"region",
    "Top 30 Ship-Now":"shipnow",
    "Top 30 Behind Plan":"behind",
    "Top 20 Stores":"stores",
    "HD Detail":"hd",
    "Lowes Detail":"lowes",
    "FOR Source Miss":"for-source",
    "Wk13 Miss Analysis":"miss",
    "Item-Level Miss Analysis":"miss",
    "Sales × Weather":"weather"
  };
  window.__everdeRetailActivateQueue=window.__everdeRetailActivateQueue||[];
  window.activate=function(name){
    var run=function(){
      var id=M[name]||M[String(name||"").trim()]||"exec";
      if(typeof showTab==="function")showTab(id);
    };
    if(window.__everdeRetailDataReady){ run(); return; }
    window.__everdeRetailActivateQueue.push(run);
  };
})();` +
  `</script>`;

function injectRetailPortalEmbeds(html: string): string {
  const withViewport = ensureViewportMeta(html);
  const headClose = /<\/head\s*>/i.exec(withViewport);
  let out =
    headClose && headClose.index >= 0
      ? withViewport.slice(0, headClose.index) +
        IFRAME_EMBED_STYLES +
        withViewport.slice(headClose.index)
      : IFRAME_EMBED_STYLES + withViewport;

  const bodyClose = /<\/body\s*>/i.exec(out);
  if (bodyClose && bodyClose.index >= 0) {
    out =
      out.slice(0, bodyClose.index) +
      PORTAL_RETAIL_ACTIVATE_BRIDGE +
      out.slice(bodyClose.index);
  } else {
    out += PORTAL_RETAIL_ACTIVATE_BRIDGE;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Retail dashboard</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>${escapeHtml(message)}</strong></p><p style="color:#555;font-size:14px">${d}</p><p style="color:#555;font-size:14px">Copy <code>Everde_West_Coast_Retail_Opportunity_Dashboard.html</code> to <code>public/</code> or set <code>RETAIL_DASHBOARD_HTML</code>.</p></body></html>`;
}

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const { path: filePath, searchedSummary } =
    await resolveRetailDashboardHtmlPath();
  if (!filePath) {
    return new NextResponse(
      htmlNotFoundBody(
        "No Everde_West_Coast_Retail_Opportunity_Dashboard.html found.",
        searchedSummary,
      ),
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
      process.env.RETAIL_DASHBOARD_HTML_USE_INLINE_D === "1"
        ? raw
        : replaceInlineRetailDataWithApiFetch(raw);
    const html = injectRetailPortalEmbeds(phaseC);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Retail-Dashboard-Path": filePath,
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
