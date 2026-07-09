import type { Attachment, TurnContext } from "botbuilder";
import { downloadMessageFilesViaGraph } from "../graph/chatMessageFiles.js";
import { getConfig } from "../config/index.js";
import { isPersonalBotChat } from "../utils/teamsConversationScope.js";
import { getTeamsMessageText } from "../utils/teamsMessageText.js";
import { logger } from "../utils/logger.js";

export interface DownloadedFile {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

interface TeamsFileDownloadInfo {
  downloadUrl?: string;
  fileName?: string;
  fileType?: string;
}

let cachedBotToken: { token: string; expiresAt: number } | null = null;

async function getBotFrameworkToken(): Promise<string> {
  const now = Date.now();
  if (cachedBotToken && cachedBotToken.expiresAt > now + 60_000) {
    return cachedBotToken.token;
  }

  const { MicrosoftAppId, MicrosoftAppPassword } = getConfig();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: MicrosoftAppId,
    client_secret: MicrosoftAppPassword,
    scope: "https://api.botframework.com/.default",
  });

  const res = await fetch(
    "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!res.ok) {
    throw new Error(`Bot Framework token request failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedBotToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };

  return json.access_token;
}

function parseTeamsFileInfo(attachment: Attachment): TeamsFileDownloadInfo | null {
  const name = attachment.name?.trim();
  const raw = attachment.content;

  if (!raw) {
    if (name && attachment.contentUrl) {
      return { fileName: name, downloadUrl: attachment.contentUrl };
    }
    return null;
  }

  try {
    const obj =
      typeof raw === "string"
        ? (JSON.parse(raw) as TeamsFileDownloadInfo)
        : (raw as TeamsFileDownloadInfo);
    if (obj?.downloadUrl) {
      return {
        downloadUrl: obj.downloadUrl,
        fileName: obj.fileName ?? name,
        fileType: obj.fileType,
      };
    }
    if (name && attachment.contentUrl) {
      return { fileName: name, downloadUrl: attachment.contentUrl };
    }
    return null;
  } catch {
    if (name && attachment.contentUrl) {
      return { fileName: name, downloadUrl: attachment.contentUrl };
    }
    return null;
  }
}

function isSkippableAttachment(attachment: Attachment): boolean {
  const ct = (attachment.contentType ?? "").toLowerCase();
  // User-uploaded files in Teams (personal + group chat after consent).
  if (ct.includes("teams.file.download.info")) return false;
  if (parseTeamsFileInfo(attachment)?.downloadUrl) return false;
  if (ct.includes("text/html")) return true;
  if (ct.includes("application/vnd.microsoft.card")) return true;
  if (ct === "application/octet-stream" && !attachment.name && !parseTeamsFileInfo(attachment)) {
    return true;
  }
  return false;
}

/** Teams rich-text / card chrome only (no user file payload). */
export function hasOnlyTeamsChromeAttachments(attachments: Attachment[]): boolean {
  return attachments.length > 0 && attachments.every((a) => isSkippableAttachment(a));
}

export function summarizeAttachments(attachments: Attachment[]): string[] {
  return attachments.map((a) => {
    const info = parseTeamsFileInfo(a);
    const parts = [
      a.contentType ?? "unknown",
      a.name ? `name=${a.name}` : "",
      info?.downloadUrl ? "hasDownloadUrl" : "",
      a.contentUrl ? "hasContentUrl" : "",
    ].filter(Boolean);
    return parts.join(" ");
  });
}

/** True when the activity includes a user-uploaded file (not Teams rich-text chrome). */
export function activityHasUserFileAttachment(attachments: Attachment[]): boolean {
  return attachments.some((attachment) => {
    if (isSkippableAttachment(attachment)) return false;
    const ct = (attachment.contentType ?? "").toLowerCase();
    if (ct.includes("teams.file.download.info") && attachment.name) return true;
    if (parseTeamsFileInfo(attachment)?.downloadUrl) return true;
    const name = attachment.name?.trim();
    if (name && (attachment.contentUrl || parseTeamsFileInfo(attachment))) {
      return true;
    }
    if (
      attachment.contentUrl &&
      (ct.includes("pdf") ||
        ct.includes("image/") ||
        ct.includes("spreadsheet") ||
        ct.includes("excel") ||
        ct.includes("csv"))
    ) {
      return true;
    }
    return false;
  });
}

async function fetchBinary(
  url: string,
  useBotAuth: boolean,
): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (useBotAuth) {
    headers.Authorization = `Bearer ${await getBotFrameworkToken()}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Attachment download failed: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download file attachments from a Teams message activity.
 */
export async function downloadMessageAttachments(
  context: TurnContext,
): Promise<DownloadedFile[]> {
  const maxBytes = getConfig().ATTACHMENT_MAX_BYTES;
  const attachments = context.activity.attachments ?? [];
  const results: DownloadedFile[] = [];

  for (const attachment of attachments) {
    if (isSkippableAttachment(attachment)) continue;

    const teamsInfo = parseTeamsFileInfo(attachment);
    const fileName =
      teamsInfo?.fileName ??
      attachment.name ??
      `attachment-${results.length + 1}`;

    let url = teamsInfo?.downloadUrl ?? attachment.contentUrl;
    if (!url) continue;

    let buffer: Buffer;
    try {
      buffer = await fetchBinary(url, false);
    } catch (firstErr) {
      logger.warn("attachment.download.retry_with_bot_auth", {
        fileName,
        err: firstErr,
      });
      try {
        buffer = await fetchBinary(url, true);
      } catch (secondErr) {
        logger.error("attachment.download.failed", {
          fileName,
          urlHost: safeUrlHost(url),
          err: secondErr,
        });
        throw secondErr;
      }
    }

    if (buffer.length > maxBytes) {
      throw new Error(
        `File "${fileName}" is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
      );
    }

    const contentType =
      attachment.contentType ??
      guessMimeFromName(fileName, teamsInfo?.fileType);

    results.push({ fileName, contentType, buffer });
    logger.info("attachment.downloaded", {
      fileName,
      contentType,
      bytes: buffer.length,
    });
  }

  return results;
}

/** True when we should attempt to fetch files (Bot Framework and/or Graph). */
export function shouldAttemptFileDownload(
  context: TurnContext,
  attachments: Attachment[],
  messageText?: string,
): boolean {
  if (activityHasUserFileAttachment(attachments)) return true;
  if (isPersonalBotChat(context)) return false;

  // Group / channel: Bot Framework often sends only HTML chrome on file uploads.
  // Do NOT treat chrome-only follow-up text messages as new file uploads.
  if (attachments.length > 0 && hasOnlyTeamsChromeAttachments(attachments)) {
    const text = (messageText ?? getTeamsMessageText(context.activity)).trim();
    const hasNamedFile = attachments.some((a) =>
      /\.(xlsx?|pdf|csv|txt|png|jpe?g|gif|webp)$/i.test(a.name ?? ""),
    );
    if (hasNamedFile) return true;
    // File-card upload with little or no caption.
    if (!text || text.length < 120) return true;
  }

  return false;
}

/**
 * Download attachments: Bot Framework (personal chat) then Graph (group / channel).
 */
export async function downloadAllMessageAttachments(
  context: TurnContext,
): Promise<DownloadedFile[]> {
  const botFiles = await downloadMessageAttachments(context);
  if (botFiles.length > 0) return botFiles;

  if (isPersonalBotChat(context)) return [];

  logger.info("graph.files.fallback", {
    conversationType: context.activity.conversation?.conversationType,
    messageId: context.activity.id,
  });

  return downloadMessageFilesViaGraph(context);
}

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function guessMimeFromName(fileName: string, fileType?: string): string {
  const ext = (fileType ?? fileName.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  return map[ext] ?? "application/octet-stream";
}
