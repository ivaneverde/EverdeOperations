import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { replaceInlineWeatherDataWithApiFetch } from "@/lib/weatherDashboardHtmlPhaseC";
import { resolveWeatherDashboardHtmlPath } from "@/lib/resolveWeatherDashboardHtmlPath";

export const dynamic = "force-dynamic";

const IFRAME_EMBED_STYLES = `<style data-everde-portal="weather-embed">
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

const PORTAL_WEATHER_ACTIVATE_BRIDGE = `<script data-everde-portal="weather-activate-bridge">
(function(){
  var M={
    "Region Overview":"overview",
    "7-Day Forecast":"forecast",
    "N. California":"nca",
    "S. California":"sca",
    "N. Texas":"ntx",
    "S. Texas":"stx",
    "Florida":"fl",
    "Colorado":"co",
    "Sales × Weather":"crosswalk"
  };
  window.__everdeWeatherActivateQueue=window.__everdeWeatherActivateQueue||[];
  window.activate=function(name){
    var run=function(){
      var id=M[name]||M[String(name||"").trim()]||"overview";
      if(typeof showTab==="function")showTab(id);
    };
    if(window.__everdeWeatherDataReady){ run(); return; }
    window.__everdeWeatherActivateQueue.push(run);
  };
})();` +
  `</script>`;

function injectWeatherPortalEmbeds(html: string): string {
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
      PORTAL_WEATHER_ACTIVATE_BRIDGE +
      out.slice(bodyClose.index);
  } else {
    out += PORTAL_WEATHER_ACTIVATE_BRIDGE;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Weather dashboard</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>${escapeHtml(message)}</strong></p><p style="color:#555;font-size:14px">${d}</p><p style="color:#555;font-size:14px">Copy <code>Everde_Weather_Dashboard.html</code> to <code>public/</code> or set <code>WEATHER_DASHBOARD_HTML</code>.</p></body></html>`;
}

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const { path: filePath, searchedSummary } =
    await resolveWeatherDashboardHtmlPath();
  if (!filePath) {
    return new NextResponse(
      htmlNotFoundBody("No Everde_Weather_Dashboard.html found.", searchedSummary),
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
      process.env.WEATHER_DASHBOARD_HTML_USE_INLINE_WX === "1"
        ? raw
        : replaceInlineWeatherDataWithApiFetch(raw);
    const html = injectWeatherPortalEmbeds(phaseC);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Weather-Dashboard-Path": filePath,
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
