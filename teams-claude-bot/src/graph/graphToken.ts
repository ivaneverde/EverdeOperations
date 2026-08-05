import type { BotProfile } from "../everde/botProfile.js";
import {
  resolveBotAppCredentials,
  type BotAppCredentials,
} from "../config/botCredentials.js";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function fetchGraphToken(creds: BotAppCredentials): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.appId);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const tenant = getConfig().MicrosoftAppTenantId?.trim();
  if (!tenant) {
    throw new Error(
      "MicrosoftAppTenantId is required for group-chat file access via Microsoft Graph.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.appId,
    client_secret: creds.password,
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
    logger.error("graph.token.failed", {
      status: res.status,
      appId: creds.appId,
      detail,
    });
    throw new Error(`Microsoft Graph token request failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(creds.appId, {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  });

  return json.access_token;
}

/**
 * App-only token for Microsoft Graph (group chat / channel file fetch).
 * Prefers the bot profile's Entra app; falls back to Claude if HD/Lowes
 * lack Graph application permissions / admin consent yet.
 */
export async function getGraphAppToken(
  profile: BotProfile = "full",
): Promise<string> {
  const primary = resolveBotAppCredentials(profile);
  try {
    return await fetchGraphToken(primary);
  } catch (err) {
    if (profile !== "full") {
      const fallback = resolveBotAppCredentials("full");
      if (fallback.appId !== primary.appId) {
        logger.warn("graph.token.fallback_to_claude", { profile, err });
        return fetchGraphToken(fallback);
      }
    }
    throw err;
  }
}
