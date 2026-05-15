import { promises as fs } from "fs";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import {
  freightBlobContainer,
  freightDashboardJsonBlobPath,
} from "@/lib/azure/freightBlobPaths";

async function streamToString(
  stream: NodeJS.ReadableStream | undefined,
): Promise<string> {
  if (!stream) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Download dashboard JSON from Azure Blob; returns null if storage is not configured or blob missing. */
export async function downloadFreightDashboardJsonFromBlob(): Promise<
  string | null
> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const container = freightBlobContainer();
  const blobPath = freightDashboardJsonBlobPath();
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

/** Optional local fallback: PUBLIC_FREIGHT_DASHBOARD_JSON relative to cwd, or public/dashboard_data.json */
export async function downloadFreightDashboardJsonFromLocal(): Promise<
  string | null
> {
  const explicit = process.env.PUBLIC_FREIGHT_DASHBOARD_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "dashboard_data.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

function sanitizeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base : "upload.xlsb";
}

/** Upload raw weekly file to incoming/{UTC iso prefix}/filename */
export async function uploadFreightIncomingFile(
  file: File,
): Promise<{ container: string; blobPath: string }> {
  const svc = getBlobServiceClient();
  if (!svc) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }
  const container = freightBlobContainer();
  const prefix = process.env.AZURE_FREIGHT_INCOMING_PREFIX?.trim() || "incoming";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = sanitizeOriginalName(file.name);
  const blobPath = `${prefix}/${stamp}/${safe}`;
  const block = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  const buf = Buffer.from(await file.arrayBuffer());
  await block.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: file.type || "application/octet-stream",
    },
  });
  return { container, blobPath };
}
