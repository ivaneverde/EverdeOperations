"use client";

import { useCallback, useRef, useState } from "react";
import type { SalesPlanRegion } from "@/lib/salesPlan/regionConfig";
import { SALES_PLAN_REGION_CONFIG } from "@/lib/salesPlan/regionConfig";

function tryActivateIframe(win: Window | null | undefined, tab: string) {
  if (!win) return;
  const fn = (win as unknown as { activate?: (n: string) => void }).activate;
  if (typeof fn !== "function") return;
  try {
    fn(tab);
  } catch {
    /* iframe may still be initializing */
  }
}

export type SalesPlanDashboardEmbedProps = {
  /** Portal tab label passed to `activate(name)` (matches dashboard nav titles). */
  salesPlanHtmlTab?: string | null;
  /** NOR CAL (default) or Oregon. */
  region?: SalesPlanRegion;
};

/**
 * Embeds Everde sales plan HTML via region-specific dashboard-html / dashboard-data APIs.
 */
export function SalesPlanDashboardEmbed({
  salesPlanHtmlTab = null,
  region = "nor-cal",
}: SalesPlanDashboardEmbedProps) {
  const cfg = SALES_PLAN_REGION_CONFIG[region];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tab = (salesPlanHtmlTab ?? "Exec Summary").trim() || "Exec Summary";
  const [iframeKey, setIframeKey] = useState(0);

  const reloadView = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const onIframeLoad = useCallback(() => {
    tryActivateIframe(iframeRef.current?.contentWindow ?? null, tab);
  }, [tab]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reloadView}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Reload view
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          title={
            region === "or"
              ? "Everde Oregon Sales Plan Dashboard"
              : "Everde NOR CAL Sales Plan Dashboard"
          }
          className="h-full min-h-0 w-full max-w-full flex-1 border-0"
          src={cfg.htmlApiPath}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={onIframeLoad}
        />
      </div>
    </div>
  );
}
