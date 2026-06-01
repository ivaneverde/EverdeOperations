import { TurnContext } from "botbuilder";
import { logger } from "../utils/logger.js";

interface FileConsentInvokeValue {
  type?: string;
  action?: { type?: string };
  context?: {
    uploadInfo?: UploadInfo;
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
 * Teams group chats require file-consent invoke handling before attachments flow to the bot.
 * Personal (1:1) bot chats usually send attachments directly.
 */
export async function handleFileConsentInvoke(
  context: TurnContext,
): Promise<boolean> {
  if (context.activity.name !== "fileConsent/invoke") {
    return false;
  }

  const value = context.activity.value as FileConsentInvokeValue | undefined;
  const actionType = value?.action?.type ?? value?.type;
  const uploadInfo = value?.context?.uploadInfo ?? value?.uploadInfo;

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

  logger.info("fileConsent.decline", { actionType });

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
