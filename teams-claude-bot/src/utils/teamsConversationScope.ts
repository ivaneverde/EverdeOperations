import type { TurnContext } from "botbuilder";

/** Teams Bot file APIs only receive user uploads in personal (1:1) chats. */
export function isPersonalBotChat(context: TurnContext): boolean {
  const type = context.activity.conversation?.conversationType;
  return !type || type === "personal";
}

export const GROUP_CHAT_FILE_HELP =
  "File analysis works in a **1:1 personal chat** with this bot — Microsoft Teams does not pass group-chat file uploads to bots.\n\nOpen **Apps** → **Claude** → start a **personal** chat (just you and the bot), attach your file with the paperclip, and ask your question again.";
