"use client";

import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Minimal redirect target for MSAL popup / silent flows. Parses `#code=…`
 * and broadcasts to the opener via BroadcastChannel so `loginPopup` can
 * resolve. The full portal shell at `/` is too heavy to use as `redirectUri`.
 *
 * Register this URL as an SPA redirect URI in Entra (same origin + path).
 */
export default function MsalRedirectBridgePage() {
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void broadcastResponseToMainFrame().catch((err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Could not complete sign-in.";
      setError(msg);
    });
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 bg-zinc-50 px-4 text-center text-sm text-zinc-700">
      {error ? (
        <>
          <p className="font-medium text-red-800">{error}</p>
          <p className="max-w-md text-xs text-zinc-600">
            If you opened this page directly, close the tab. Otherwise confirm
            <code className="mx-1 rounded bg-white px-1 ring-1 ring-zinc-200">
              …/auth/msal-bridge
            </code>
            is registered as an SPA redirect URI in your Entra app.
          </p>
        </>
      ) : (
        <p>Completing sign-in…</p>
      )}
    </div>
  );
}
