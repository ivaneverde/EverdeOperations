import { BlobServiceClient } from "@azure/storage-blob";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

export type PreeminentLicenseStatus = {
  period: string;
  paid: boolean;
  services_enabled: boolean;
  enable_reason?: string;
  checked_at?: string;
};

const BLOB_PATH = "license/preeminent_status.json";
let cache: { at: number; status: PreeminentLicenseStatus | null } | null = null;
const CACHE_MS = 60_000;

function enforceEnabled(): boolean {
  const raw = process.env.PREEMINENT_LICENSE_ENFORCE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function fetchStatus(): Promise<PreeminentLicenseStatus | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.status;

  const config = getConfig();
  const conn = config.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conn) {
    cache = { at: now, status: null };
    return null;
  }
  const container =
    config.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
  try {
    const svc = BlobServiceClient.fromConnectionString(conn);
    const client = svc.getContainerClient(container).getBlobClient(BLOB_PATH);
    const buf = await client.downloadToBuffer();
    const status = JSON.parse(buf.toString("utf8")) as PreeminentLicenseStatus;
    cache = { at: now, status };
    return status;
  } catch (err) {
    logger.warn("preeminent.license.fetch_failed", { err });
    cache = { at: now, status: null };
    return null;
  }
}

/** Fail open unless enforce is on and Blob explicitly disables services. */
export async function assertPreeminentLicenseAllowsBot(): Promise<{
  allowed: boolean;
  message?: string;
}> {
  if (!enforceEnabled()) {
    return { allowed: true };
  }
  const status = await fetchStatus();
  if (!status) {
    return { allowed: true };
  }
  if (status.services_enabled === false) {
    return {
      allowed: false,
      message:
        `Everde Teams bots are offline until Preeminent library payment proof is on file` +
        (status.period ? ` for **${status.period}**` : "") +
        `. An admin must record the PayPal receipt (or upload proof) before chat resumes.`,
    };
  }
  return { allowed: true };
}
