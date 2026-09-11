import { TurnContext } from "botbuilder";
import { logger } from "../utils/logger.js";
import { completeOutboundFileConsentAccept } from "./outboundFileConsent.js";

interface FileConsentInvokeValue {
  type?: string;
  action?: string | { type?: string };
  context?: Record<string, unknown> & {
    uploadInfo?: UploadInfo;
    pendingFileId?: string;
    kind?: string;
  };
  uploadInfo?: UploadInfo;
}

interface UploadInfo {
  uploadUrl: string;
  contentUrl: string;
  name: string;
  uniqueId: string;
  fileType: string;
}

/**
 * Handles both:
 * - User→bot file consent (group chat inbound) — action fileUpload
 * - Bot→user FileConsentCard accept — action accept + PUT to uploadUrl
 */
export async function handleFileConsentInvoke(
  context: TurnContext,
): Promise<boolean> {
  if (context.activity.name !== "fileConsent/invoke") {
    return false;
  }

  const value = context.activity.value as FileConsentInvokeValue | undefined;
  const actionRaw = value?.action;
  const actionType =
    typeof actionRaw === "string" ? actionRaw : actionRaw?.type ?? value?.type;
  const uploadInfo = value?.context?.uploadInfo ?? value?.uploadInfo;
  const acceptContext = value?.context ?? {};
  const pendingFileId =
    typeof acceptContext.pendingFileId === "string"
      ? acceptContext.pendingFileId
      : undefined;
  const kind =
    typeof acceptContext.kind === "string" ? acceptContext.kind : undefined;

  // Bot→user outbound download
  if (
    (actionType === "accept" || kind === "outbound") &&
    uploadInfo?.uploadUrl &&
    (pendingFileId || kind === "outbound")
  ) {
    logger.info("fileConsent.outbound_accept", {
      fileName: uploadInfo.name,
      pendingFileId,
    });

    await context.sendActivity({
      type: "invokeResponse",
      value: { status: 200 },
    });

    await completeOutboundFileConsentAccept(
      context,
      uploadInfo,
      pendingFileId,
    );
    return true;
  }

  if (actionType === "decline") {
    logger.info("fileConsent.decline", { actionType, kind });
    await context.sendActivity({
      type: "invokeResponse",
      value: { status: 200 },
    });
    if (kind === "outbound") {
      await context.sendActivity("Okay — mass upload download canceled.");
    }
    return true;
  }

  // Legacy inbound (user uploading to bot in group chat)
  if (actionType === "fileUpload" && uploadInfo) {
    logger.info("fileConsent.accept", { fileName: uploadInfo.name });

    await context.sendActivity({
      type: "invokeResponse",
      value: {
        status: 200,
        body: {
          action: {
            type: "accept",
            uploadInfo,
          },
        },
      },
    });
    return true;
  }

  logger.info("fileConsent.unhandled", { actionType });
  await context.sendActivity({
    type: "invokeResponse",
    value: {
      status: 200,
      body: {
        action: { type: "decline" },
      },
    },
  });

  return true;
}
