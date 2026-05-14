import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { ensureViewportMeta } from "@/lib/ensureViewportMeta";
import { resolveNurseryDashboardHtmlPath } from "@/lib/nurseryDashboardResolve";

export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectPortalNursery(html: string, embed: boolean): string {
  if (!embed) return html;
  const style = `<style data-everde-portal="nursery-embed">
html[data-everde-nursery-embed] .report-switcher { display: none !important; }
html[data-everde-nursery-embed] body {
  overflow-x: hidden !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box;
}
html[data-everde-nursery-embed] .wrap {
  max-width: 100% !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
  box-sizing: border-box;
  min-width: 0 !important;
  overflow-x: auto !important;
  overscroll-behavior-x: contain;
}
html[data-everde-nursery-embed] .wrap > * {
  max-width: 100% !important;
  overflow-x: visible !important;
}
</style>`;
  let out = html;
  const headClose = /<\/head\s*>/i.exec(out);
  if (headClose && headClose.index >= 0) {
    out = out.slice(0, headClose.index) + style + out.slice(headClose.index);
  } else {
    out = style + out;
  }
  out = out.replace(/<html(\s[^>]*)?>/i, '<html$1 data-everde-nursery-embed="1">');
  return out;
}

function notFoundBody(hint: string): string {
  const h = escapeHtml(hint);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Nursery dashboard</title></head><body style="font-family:system-ui;padding:1.5rem;max-width:44rem"><p><strong>Nursery inventory dashboard HTML not found.</strong></p><p style="color:#555;font-size:14px">${h}</p><p style="color:#555;font-size:14px">Set <code>NURSERY_DASHBOARD_HTML</code> in <code>.env.local</code> to the full path of <code>nursery-inventory-dashboard.html</code>, or place a copy at <code>public/nursery-inventory-dashboard.html</code>.</p></body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const embed = url.searchParams.get("embed") === "1";
  const paneRaw = url.searchParams.get("pane")?.trim().toLowerCase();
  const pane = paneRaw === "demand" ? "demand" : "supply";

  const filePath = await resolveNurseryDashboardHtmlPath();
  if (!filePath) {
    const tried = [
      process.env.NURSERY_DASHBOARD_HTML?.trim(),
      "%USERPROFILE%\\Documents\\nursery-inventory-dashboard.html",
      "public/nursery-inventory-dashboard.html",
    ]
      .filter(Boolean)
      .join(" · ");
    return new NextResponse(notFoundBody(`Tried: ${tried}`), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const html = injectPortalNursery(ensureViewportMeta(raw), embed);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Nursery-Dashboard-Path": filePath,
        "X-Nursery-Pane": pane,
      },
    });
  } catch {
    return new NextResponse(notFoundBody(`Could not read: ${filePath}`), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
