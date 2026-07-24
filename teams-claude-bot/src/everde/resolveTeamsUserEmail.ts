import { TeamsInfo, type TurnContext } from "botbuilder";
import { logger } from "../utils/logger.js";

/**
 * Resolve the signed-in Teams user's email for view-rights.
 * Falls back to null (treated as full access) if Graph/Teams lookup fails.
 */
export async function resolveTeamsUserEmail(
  context: TurnContext,
): Promise<string | null> {
  const userId = context.activity.from?.id;
  if (!userId) return null;

  try {
    const member = await TeamsInfo.getMember(context, userId);
    const email =
      (member.email || member.userPrincipalName || "").trim() || null;
    if (email) {
      logger.info("viewRights.identity", {
        email: email.toLowerCase(),
        name: member.name,
      });
    }
    return email;
  } catch (err) {
    logger.warn("viewRights.identity_failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
