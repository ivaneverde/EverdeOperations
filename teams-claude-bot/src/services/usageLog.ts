import { getBlobServiceClient } from "../azure/blobClient.js";
import type { BotProfile } from "../everde/botProfile.js";
import { logger } from "../utils/logger.js";

export type UsageLogEntry = {
  ts: string;
  email: string | null;
  profile: BotProfile;
  question: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  tools: string[];
  conversationId?: string;
};

const QUESTION_MAX = 500;

function freightContainer(): string {
  return (
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight"
  );
}

function truncateQuestion(q: string): string {
  const oneLine = q.replace(/\s+/g, " ").trim();
  if (oneLine.length <= QUESTION_MAX) return oneLine;
  return `${oneLine.slice(0, QUESTION_MAX)}…`;
}

/**
 * Fire-and-forget usage row. Never awaited on the reply path.
 * Writes one NDJSON line to Blob (append) + stdout so App Insights can pick it up.
 */
export function recordTeamsBotUsage(entry: UsageLogEntry): void {
  const row = {
    ...entry,
    email: entry.email?.toLowerCase() ?? null,
    question: truncateQuestion(entry.question || ""),
    total_tokens: entry.input_tokens + entry.output_tokens,
  };

  logger.info("teams.usage", row);

  void appendUsageBlob(row).catch((err) => {
    logger.warn("teams.usage.blob_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

async function appendUsageBlob(row: Record<string, unknown>): Promise<void> {
  const svc = getBlobServiceClient();
  if (!svc) return;

  const day = String(row.ts).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const blobPath = `teams-bot-usage/${day}.ndjson`;
  const container = svc.getContainerClient(freightContainer());
  const blob = container.getAppendBlobClient(blobPath);

  await blob.createIfNotExists();
  const line = `${JSON.stringify(row)}\n`;
  const buf = Buffer.from(line, "utf8");
  await blob.appendBlock(buf, buf.length);
}
