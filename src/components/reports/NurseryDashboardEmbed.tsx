"use client";

import { useCallback, useRef } from "react";

export type NurseryDashboardEmbedProps = {
  pane: "supply" | "demand";
};

/**
 * Full-page nursery analytics from `nursery-inventory-dashboard.html` (served by
 * `GET /api/nursery/dashboard-html`). Portal nav selects supply vs demand; inner tab bar is hidden in embed mode.
 */
export function NurseryDashboardEmbed({ pane }: NurseryDashboardEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const onLoad = useCallback(() => {
    if (pane === "supply") return;
    const run = () => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        const doc = win.document;
        const tab = doc.querySelector(
          `.report-tab[data-report="${pane}"]`,
        ) as HTMLElement | null;
        tab?.click();
      } catch {
        /* document not ready */
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [pane]);

  const src = `/api/nursery/dashboard-html?embed=1&pane=${encodeURIComponent(pane)}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <iframe
        ref={iframeRef}
        key={src}
        title="Nursery inventory analytics"
        src={src}
        className="min-h-0 min-w-0 w-full max-w-full flex-1 border-0"
        sandbox="allow-scripts allow-same-origin allow-popups"
        onLoad={onLoad}
      />
    </div>
  );
}
