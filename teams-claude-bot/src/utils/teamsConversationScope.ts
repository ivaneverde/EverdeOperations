import type { TurnContext } from "botbuilder";

/** Teams Bot file APIs only receive user uploads directly in personal (1:1) chats. */
export function isPersonalBotChat(context: TurnContext): boolean {
  const type = context.activity.conversation?.conversationType;
  return !type || type === "personal";
}

export const GRAPH_PERMISSION_HELP =
  "I could not read the file from this group chat. Ask IT to grant the Claude bot app **Chat.Read.All** and **Files.Read.All** (application permissions + admin consent) in Entra, then **reinstall** the Teams app in this chat. Details: `teams-claude-bot/docs/GRAPH_GROUP_FILES.md`.";
