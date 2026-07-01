import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

let cached: { token: string; expiresAt: number } | null = null;

/** App-only token for Microsoft Graph (group chat / channel file fetch). */
export async function getGraphAppToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const { MicrosoftAppId, MicrosoftAppPassword, MicrosoftAppTenantId } =
    getConfig();
  const tenant = MicrosoftAppTenantId?.trim();
  if (!tenant) {
    throw new Error(
      "MicrosoftAppTenantId is required for group-chat file access via Microsoft Graph.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: MicrosoftAppId,
    client_secret: MicrosoftAppPassword,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    logger.error("graph.token.failed", { status: res.status, detail });
    throw new Error(`Microsoft Graph token request failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };

  return json.access_token;
}
