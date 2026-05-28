import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import { resolveSalesPlanDashboardHtmlPath } from "@/lib/resolveSalesPlanDashboardHtmlPath";
import { injectOrSalesPlanPortalEmbeds } from "@/lib/salesPlanDashboardHtmlPhaseC";

export const dynamic = "force-dynamic";

const IFRAME_EMBED_STYLES = `<style data-everde-portal="sales-plan-or-embed">
html,body{overflow-x:hidden!important;max-width:100%!important;width:100%!important;min-width:0!important;box-sizing:border-box}
#sidebar{display:none!important;width:0!important;min-width:0!important;margin:0!important;padding:0!important;border:none!important;overflow:hidden!important}
#app{display:flex!important;min-height:100%!important;height:100%!important}
#main{flex:1 1 auto!important;min-width:0!important;width:100%!important;max-width:100%!important;overflow-y:auto!important;overflow-x:hidden!important;box-sizing:border-box}
</style>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlNotFoundBody(message: string, detail: string): string {
  const d = escapeHtml(detail);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>OR Sales Plan</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>${escapeHtml(message)}</strong></p><p style="color:#555;font-size:14px">${d}</p><p style="color:#555;font-size:14px">Copy <code>Everde_OR_Sales_Plan_Dashboard.html</code> to <code>public/</code>.</p></body></html>`;
}

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const { path: filePath, searchedSummary } =
    await resolveSalesPlanDashboardHtmlPath("or");
  if (!filePath) {
    return new NextResponse(
      htmlNotFoundBody(
        "No Everde_OR_Sales_Plan_Dashboard.html found.",
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
    const withViewport = ensureViewportMeta(raw);
    const headClose = /<\/head\s*>/i.exec(withViewport);
    const withStyles =
      headClose && headClose.index >= 0
        ? withViewport.slice(0, headClose.index) +
          IFRAME_EMBED_STYLES +
          withViewport.slice(headClose.index)
        : IFRAME_EMBED_STYLES + withViewport;
    const html = injectOrSalesPlanPortalEmbeds(withStyles);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Sales-Plan-Dashboard-Path": filePath,
        "X-Everde-Sales-Plan-Region": "or",
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
