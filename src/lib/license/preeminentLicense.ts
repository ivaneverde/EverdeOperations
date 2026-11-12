import { getBlobServiceClient } from "@/lib/azure/blobClient";

export type PreeminentProof = {
  source: "email" | "upload";
  subject?: string;
  from?: string;
  received?: string;
  /** Exact invoice period on the receipt (e.g. DEC2026). */
  invoice?: string;
  merchant?: string;
  path?: string;
  name?: string;
  modified?: string;
  validation?: string;
};

export type PreeminentLicenseStatus = {
  vendor: string;
  product: string;
  period: string;
  paid: boolean;
  proof: PreeminentProof | null;
  services_enabled: boolean;
  enable_reason: string;
  checked_at: string;
  policy?: {
    grace: string;
    proof: string;
  };
};

const BLOB_PATH = "license/preeminent_status.json";

function containerName(): string {
  return (
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight"
  );
}

/** When unset/0, license gate is off (dev-friendly). Set PREEMINENT_LICENSE_ENFORCE=1 in prod. */
export function isPreeminentLicenseEnforced(): boolean {
  const raw = process.env.PREEMINENT_LICENSE_ENFORCE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function loadPreeminentLicenseStatus(): Promise<PreeminentLicenseStatus | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  try {
    const client = svc
      .getContainerClient(containerName())
      .getBlobClient(BLOB_PATH);
    const buf = await client.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as PreeminentLicenseStatus;
  } catch {
    return null;
  }
}

/**
 * Returns false only when enforcement is on AND Blob says services_enabled=false.
 * Missing Blob / unset enforce → allow (fail open for ops continuity unless enforced+disabled).
 */
export async function arePreeminentServicesAllowed(): Promise<{
  allowed: boolean;
  status: PreeminentLicenseStatus | null;
  enforce: boolean;
}> {
  const enforce = isPreeminentLicenseEnforced();
  const status = await loadPreeminentLicenseStatus();
  if (!enforce) {
    return { allowed: true, status, enforce };
  }
  if (!status) {
    // Enforced but no status yet — keep up until the checker publishes.
    return { allowed: true, status: null, enforce };
  }
  return {
    allowed: status.services_enabled !== false,
    status,
    enforce,
  };
}

export async function publishPreeminentLicenseStatus(
  status: PreeminentLicenseStatus,
): Promise<{ container: string; blobPath: string }> {
  const svc = getBlobServiceClient();
  if (!svc) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }
  const container = containerName();
  const client = svc.getContainerClient(container).getBlockBlobClient(BLOB_PATH);
  const body = Buffer.from(JSON.stringify(status, null, 2), "utf8");
  await client.uploadData(body, {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  return { container, blobPath: BLOB_PATH };
}

export function periodForDate(d = new Date()): string {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return `${months[d.getMonth()]}${d.getFullYear()}`;
}
