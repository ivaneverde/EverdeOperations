import type { TurnContext } from "botbuilder";
import { getConfig } from "../config/index.js";
import type { DownloadedFile } from "../services/teamsAttachmentDownloader.js";
import { logger } from "../utils/logger.js";
import { isPersonalBotChat } from "../utils/teamsConversationScope.js";
import { getGraphAppToken } from "./graphToken.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface GraphAttachment {
  id?: string;
  contentType?: string;
  contentUrl?: string | null;
  name?: string | null;
}

interface GraphChatMessage {
  attachments?: GraphAttachment[];
}

interface HostedContentRow {
  id?: string;
  contentType?: string;
}

export class GraphFileAccessError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GraphFileAccessError";
  }
}

function encodeSharingUrl(contentUrl: string): string {
  const base64 = Buffer.from(contentUrl, "utf8").toString("base64");
  const unpadded = base64
    .replace(/=/g, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");
  return `u!${unpadded}`;
}

function guessMimeFromName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    txt: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return map[ext] ?? "application/octet-stream";
}

function isSkippableGraphAttachment(att: GraphAttachment): boolean {
  const ct = (att.contentType ?? "").toLowerCase();
  if (!ct) return true;
  if (ct.includes("adaptivecard") || ct.includes("application/vnd.microsoft.card")) {
    return true;
  }
  if (ct.includes("mention") || ct.includes("quotedmessage")) return true;
  return false;
}

function isFileReferenceAttachment(att: GraphAttachment): boolean {
  if (isSkippableGraphAttachment(att)) return false;
  const ct = (att.contentType ?? "").toLowerCase();
  if (ct === "reference") return Boolean(att.contentUrl && att.name);
  if (att.contentUrl && att.name) {
    const ext = att.name.split(".").pop()?.toLowerCase() ?? "";
    return ["pdf", "xlsx", "xls", "csv", "txt", "png", "jpg", "jpeg", "gif", "webp"].includes(
      ext,
    );
  }
  return false;
}

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GraphFileAccessError(
      `Graph GET ${path} failed: ${res.status} ${body.slice(0, 240)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

async function graphGetBinary(token: string, path: string): Promise<Buffer> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new GraphFileAccessError(
      `Graph download ${path} failed: ${res.status}`,
      res.status,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadFromSharePointUrl(
  token: string,
  contentUrl: string,
): Promise<string> {
  const sharing = encodeSharingUrl(contentUrl);
  const item = await graphGet<{
    "@microsoft.graph.downloadUrl"?: string;
    name?: string;
  }>(token, `/shares/${sharing}/driveItem`);

  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new GraphFileAccessError(
      "Graph shares API returned no download URL for the attachment.",
    );
  }
  return downloadUrl;
}

async function fetchUrlBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GraphFileAccessError(
      `File bytes download failed: ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

function messageGraphPath(context: TurnContext): string | null {
  const messageId = context.activity.id;
  if (!messageId) return null;

  const conversationType = context.activity.conversation?.conversationType;
  const channelData = context.activity.channelData as
    | {
        team?: { id?: string };
        channel?: { id?: string };
        teamsTeamId?: string;
        teamsChannelId?: string;
      }
    | undefined;

  if (conversationType === "channel") {
    const teamId =
      channelData?.team?.id ?? channelData?.teamsTeamId ?? undefined;
    const channelId =
      channelData?.channel?.id ?? channelData?.teamsChannelId ?? undefined;
    if (!teamId || !channelId) return null;
    return `/teams/${teamId}/channels/${channelId}/messages/${messageId}`;
  }

  const chatId = context.activity.conversation?.id;
  if (!chatId) return null;
  return `/chats/${encodeURIComponent(chatId)}/messages/${messageId}`;
}

function hostedContentsPath(messagePath: string): string {
  return `${messagePath}/hostedContents`;
}

/**
 * Download user file attachments from a group chat or channel message via Microsoft Graph.
 * Teams Bot Framework does not pass file bytes in non-personal scopes; Graph reads the message
 * and resolves SharePoint / OneDrive references.
 */
export async function downloadMessageFilesViaGraph(
  context: TurnContext,
): Promise<DownloadedFile[]> {
  if (isPersonalBotChat(context)) return [];

  const messagePath = messageGraphPath(context);
  if (!messagePath) {
    logger.warn("graph.files.no_message_path", {
      conversationType: context.activity.conversation?.conversationType,
    });
    return [];
  }

  const maxBytes = getConfig().ATTACHMENT_MAX_BYTES;
  let token: string;
  try {
    token = await getGraphAppToken();
  } catch (err) {
    logger.error("graph.files.token", { err });
    throw err;
  }

  let message: GraphChatMessage;
  try {
    message = await graphGet<GraphChatMessage>(token, messagePath);
  } catch (err) {
    if (err instanceof GraphFileAccessError && err.status === 403) {
      throw new GraphFileAccessError(
        "Microsoft Graph denied access to this chat message. IT must grant the bot app **Chat.Read.All** and **Files.Read.All** (application permissions + admin consent), then reinstall the Teams app in this chat. See teams-claude-bot/docs/GRAPH_GROUP_FILES.md.",
        403,
      );
    }
    throw err;
  }

  const results: DownloadedFile[] = [];

  for (const att of message.attachments ?? []) {
    if (!isFileReferenceAttachment(att) || !att.contentUrl || !att.name) continue;

    try {
      const downloadUrl = await downloadFromSharePointUrl(token, att.contentUrl);
      const buffer = await fetchUrlBinary(downloadUrl);
      if (buffer.length > maxBytes) {
        throw new Error(
          `File "${att.name}" is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
        );
      }
      results.push({
        fileName: att.name,
        contentType: guessMimeFromName(att.name),
        buffer,
      });
      logger.info("graph.file.downloaded", {
        fileName: att.name,
        bytes: buffer.length,
      });
    } catch (err) {
      logger.warn("graph.file.reference_failed", {
        fileName: att.name,
        err,
      });
    }
  }

  if (results.length > 0) return results;

  // Inline images (hosted content) — common for screenshots pasted in meetings.
  try {
    const hosted = await graphGet<{ value?: HostedContentRow[] }>(
      token,
      hostedContentsPath(messagePath),
    );
    for (const row of hosted.value ?? []) {
      if (!row.id) continue;
      const ct = (row.contentType ?? "").toLowerCase();
      if (!ct.startsWith("image/")) continue;
      const buffer = await graphGetBinary(
        token,
        `${hostedContentsPath(messagePath)}/${row.id}/$value`,
      );
      if (buffer.length > maxBytes) continue;
      const ext = ct.split("/")[1] ?? "png";
      results.push({
        fileName: `image-${row.id}.${ext}`,
        contentType: ct,
        buffer,
      });
    }
  } catch (err) {
    logger.warn("graph.hosted_contents.failed", { err });
  }

  return results;
}
