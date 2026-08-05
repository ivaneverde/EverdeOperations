import type { BotProfile } from "../everde/botProfile.js";
import { getConfig } from "./index.js";

export type BotAppCredentials = {
  appId: string;
  password: string;
};

/** Entra app credentials for the Teams bot profile receiving the turn. */
export function resolveBotAppCredentials(profile: BotProfile): BotAppCredentials {
  const c = getConfig();
  if (profile === "hd") {
    const appId = c.MicrosoftAppIdHd?.trim();
    const password = c.MicrosoftAppPasswordHd?.trim();
    if (appId && password) return { appId, password };
  }
  if (profile === "lowes") {
    const appId = c.MicrosoftAppIdLowes?.trim();
    const password = c.MicrosoftAppPasswordLowes?.trim();
    if (appId && password) return { appId, password };
  }
  return { appId: c.MicrosoftAppId, password: c.MicrosoftAppPassword };
}
