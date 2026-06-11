import type { Activity } from "botbuilder";
import { TurnContext } from "botbuilder";

function stripHtml(html: string): string {
  return html
    .replace(/<at[^>]*>.*?<\/at>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain user text from a Teams message (handles HTML-only payloads). */
export function getTeamsMessageText(activity: Activity): string {
  const raw = TurnContext.removeRecipientMention(activity);
  const direct = (raw ?? activity.text ?? "").trim();
  if (direct) return direct;

  for (const attachment of activity.attachments ?? []) {
    const ct = (attachment.contentType ?? "").toLowerCase();
    if (!ct.includes("text/html")) continue;
    const html =
      typeof attachment.content === "string"
        ? attachment.content
        : attachment.contentUrl
          ? ""
          : "";
    if (!html) continue;
    const text = stripHtml(html);
    if (text) return text;
  }

  return "";
}
