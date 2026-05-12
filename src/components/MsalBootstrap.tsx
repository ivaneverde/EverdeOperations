"use client";

import { useEffect } from "react";
import { getPublicClientApplication } from "@/lib/msal/clientApp";

/**
 * Runs `handleRedirectPromise()` on load for redirect-based sign-in. Popup
 * flows use `/auth/msal-bridge` + `broadcastResponseToMainFrame`; this still
 * helps if you add `loginRedirect` later.
 */
export function MsalBootstrap() {
  useEffect(() => {
    void getPublicClientApplication().then((app) => {
      if (!app) return;
      return app.handleRedirectPromise().catch(() => {
        // No redirect in progress — safe to ignore.
      });
    });
  }, []);
  return null;
}
