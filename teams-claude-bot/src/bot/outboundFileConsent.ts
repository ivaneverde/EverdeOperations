import { TurnContext, MessageFactory, type Attachment } from "botbuilder";
import { logger } from "../utils/logger.js";
import {
  putPendingOutboundFile,
  takePendingOutboundFile,
} from "./pendingOutboundFiles.js";

const FILE_CONSENT_CONTENT_TYPE =
  "application/vnd.microsoft.teams.card.file.consent";
const FILE_INFO_CONTENT_TYPE =
  "application/vnd.microsoft.teams.card.file.info";

/**
 * Offer a bot→user file download via Teams FileConsentCard (personal chat).
 * User Accept → fileConsent/invoke → PUT bytes to uploadUrl → FileInfoCard.
 */
export async function offerTeamsFileDownload(
  context: TurnContext,
  opts: {
    fileName: string;
    buffer: Buffer;
    description: string;
    email: string | null;
  },
): Promise<void> {
  const pending = putPendingOutboundFile(opts);

  const attachment: Attachment = {
    contentType: FILE_CONSENT_CONTENT_TYPE,
    name: opts.fileName,
    content: {
      description: opts.description,
      sizeInBytes: opts.buffer.length,
      acceptContext: {
        pendingFileId: pending.id,
        fileName: opts.fileName,
        kind: "outbound",
      },
      declineContext: {
        pendingFileId: pending.id,
        fileName: opts.fileName,
        kind: "outbound",
      },
    },
  };

  await context.sendActivity({
    type: "message",
    text: `Ready: **${opts.fileName}** (${Math.round(opts.buffer.length / 1024)} KB). Accept the file card below to save it to your OneDrive / Downloads.`,
    attachments: [attachment],
  });

  logger.info("outboundFile.consent_sent", {
    pendingFileId: pending.id,
    fileName: opts.fileName,
    bytes: opts.buffer.length,
    email: opts.email,
  });
}

export async function completeOutboundFileConsentAccept(
  context: TurnContext,
  uploadInfo: {
    uploadUrl: string;
    contentUrl: string;
    name: string;
    uniqueId: string;
    fileType: string;
  },
  pendingFileId: string | undefined,
): Promise<boolean> {
  if (!pendingFileId) {
    logger.warn("outboundFile.accept_missing_pending_id");
    return false;
  }

  const pending = takePendingOutboundFile(pendingFileId);
  if (!pending) {
    await context.sendActivity(
      MessageFactory.text(
        "That file offer expired or was already downloaded. Ask me again with **generate a mass upload**.",
      ),
    );
    return true;
  }

  const size = pending.buffer.length;
  const res = await fetch(uploadInfo.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: pending.buffer,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error("outboundFile.put_failed", {
      status: res.status,
      body: body.slice(0, 500),
      fileName: pending.fileName,
    });
    await context.sendActivity(
      MessageFactory.text(
        `Could not upload **${pending.fileName}** to Teams (HTTP ${res.status}). Try again in a 1:1 chat with @Claude.`,
      ),
    );
    return true;
  }

  const fileInfo: Attachment = {
    contentType: FILE_INFO_CONTENT_TYPE,
    name: uploadInfo.name || pending.fileName,
    contentUrl: uploadInfo.contentUrl,
    content: {
      uniqueId: uploadInfo.uniqueId,
      fileType: uploadInfo.fileType,
    },
  };

  await context.sendActivity({
    type: "message",
    text: `Uploaded **${pending.fileName}**. Open it from the card below.`,
    attachments: [fileInfo],
  });

  logger.info("outboundFile.upload_ok", {
    fileName: pending.fileName,
    bytes: size,
  });
  return true;
}
