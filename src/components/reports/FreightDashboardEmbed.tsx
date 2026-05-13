"use client";

import { useCallback, useRef, useState } from "react";

function tryActivateIframe(win: Window | null | undefined, tab: string) {
  if (!win) return;
  const fn = (win as unknown as { activate?: (n: string) => void }).activate;
  if (typeof fn !== "function") return;
  try {
    fn(tab);
  } catch {
    /* iframe document may still be initializing */
  }
}

export type FreightDashboardEmbedProps = {
  /**
   * Exact tab title passed to the dashboard script's `activate(name)` (must match `data-tab` in HTML).
   * Defaults to Cover.
   */
  freightHtmlTab?: string | null;
  /** When true, show Reload view + Run pipeline (primary Everde Freight Dashboard entry only). */
  showPipelineControls?: boolean;
};

/**
 * Embeds the latest `Everde_Freight_Dashboard*.html` from the share
 * (`GET /api/freight/dashboard-html`) and optionally triggers `update.py`.
 */
export function FreightDashboardEmbed({
  freightHtmlTab = null,
  showPipelineControls = false,
}: FreightDashboardEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tab = (freightHtmlTab ?? "Cover").trim() || "Cover";
  const [iframeKey, setIframeKey] = useState(0);
  const [pipelineLog, setPipelineLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadView = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const runPipeline = async () => {
    setBusy(true);
    setPipelineLog(null);
    try {
      const res = await fetch("/api/freight/run-pipeline", { method: "POST" });
      const json: unknown = await res.json();
      setPipelineLog(JSON.stringify(json, null, 2));
      if (res.ok) setIframeKey((k) => k + 1);
    } catch (e) {
      setPipelineLog(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onIframeLoad = useCallback(() => {
    tryActivateIframe(iframeRef.current?.contentWindow ?? null, tab);
  }, [tab]);

  return (
    <div className="space-y-3">
      {showPipelineControls && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reloadView}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Reload view
            </button>
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={busy}
              className="rounded-md bg-[var(--everde-forest)] px-3 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
            >
              {busy ? "Running pipeline…" : "Run pipeline (Python)"}
            </button>
          </div>
          <p className="text-xs text-zinc-600">
            <span className="font-medium">Run pipeline</span> only works when{" "}
            <code className="rounded bg-zinc-100 px-1">FREIGHT_ALLOW_PIPELINE=1</code>{" "}
            is set in <code className="rounded bg-zinc-100 px-1">.env.local</code>,{" "}
            <code className="rounded bg-zinc-100 px-1">Freight/_pipeline/update.py</code>{" "}
            exists on the share, and this machine can run Python (set{" "}
            <code className="rounded bg-zinc-100 px-1">FREIGHT_PYTHON</code> in{" "}
            <code className="rounded bg-zinc-100 px-1">.env.local</code> if{" "}
            <code className="rounded bg-zinc-100 px-1">python</code> is not on PATH).
            Otherwise run <code className="rounded bg-zinc-100 px-1">python update.py</code>{" "}
            manually, then use <span className="font-medium">Reload view</span>.
          </p>
          {pipelineLog && (
            <pre className="max-h-48 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-800">
              {pipelineLog}
            </pre>
          )}
        </>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          title="Everde Freight Dashboard"
          className="h-[min(85vh,920px)] w-full border-0"
          src="/api/freight/dashboard-html"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={onIframeLoad}
        />
      </div>
    </div>
  );
}
