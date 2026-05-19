"use client";

import { useCallback, useRef, useState } from "react";

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

export type WeatherDashboardEmbedProps = {
  weatherHtmlTab?: string | null;
};

export function WeatherDashboardEmbed({
  weatherHtmlTab = null,
}: WeatherDashboardEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tab = (weatherHtmlTab ?? "Region Overview").trim() || "Region Overview";
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
          title="Everde Weather Dashboard"
          className="h-full min-h-0 w-full max-w-full flex-1 border-0"
          src="/api/weather/dashboard-html"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={onIframeLoad}
        />
      </div>
    </div>
  );
}
