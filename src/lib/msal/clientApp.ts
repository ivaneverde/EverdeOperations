import {
  PublicClientApplication,
  type Configuration,
} from "@azure/msal-browser";

let singleton: PublicClientApplication | null = null;
let lock: Promise<PublicClientApplication | null> | null = null;

function buildMsalConfig(): Configuration | null {
  const clientId = process.env.NEXT_PUBLIC_MS_ENTRA_CLIENT_ID;
  if (!clientId) return null;
  const tenant =
    process.env.NEXT_PUBLIC_MS_ENTRA_TENANT_ID?.trim() || "organizations";
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenant}`,
      redirectUri:
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/msal-bridge`
          : "http://localhost:3000/auth/msal-bridge",
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  };
}

export function isMsalConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MS_ENTRA_CLIENT_ID);
}

/**
 * Single browser-side MSAL instance so popup redirect (`#code=…`) is handled
 * on the same PublicClientApplication that started login.
 */
export async function getPublicClientApplication(): Promise<PublicClientApplication | null> {
  if (singleton) return singleton;
  if (!lock) {
    lock = (async () => {
      const cfg = buildMsalConfig();
      if (!cfg) return null;
      const app = new PublicClientApplication(cfg);
      await app.initialize();
      singleton = app;
      return app;
    })().finally(() => {
      lock = null;
    });
  }
  return lock;
}
