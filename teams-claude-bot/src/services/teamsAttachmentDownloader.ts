import type { Attachment, TurnContext } from "botbuilder";
import { getConfig } from "../config/index.js";
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
  const raw = attachment.content;
  if (!raw) return null;
  try {
    const obj =
      typeof raw === "string"
        ? (JSON.parse(raw) as TeamsFileDownloadInfo)
        : (raw as TeamsFileDownloadInfo);
    return obj?.downloadUrl ? obj : null;
  } catch {
    return null;
  }
}

function isSkippableAttachment(attachment: Attachment): boolean {
  const ct = (attachment.contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return true;
  if (ct.includes("application/vnd.microsoft.card")) return true;
  return false;
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

    let useBotAuth = !teamsInfo?.downloadUrl;

    let buffer: Buffer;
    try {
      buffer = await fetchBinary(url, useBotAuth);
    } catch (firstErr) {
      if (teamsInfo?.downloadUrl) {
        logger.warn("attachment.download.retry_with_bot_auth", {
          fileName,
          err: firstErr,
        });
        buffer = await fetchBinary(url, true);
      } else {
        throw firstErr;
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
