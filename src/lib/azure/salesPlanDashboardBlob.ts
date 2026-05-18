import { promises as fs } from "fs";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import {
  salesPlanBlobContainer,
  salesPlanDashboardJsonBlobPath,
} from "@/lib/azure/salesPlanBlobPaths";

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

export async function downloadSalesPlanDashboardJsonFromBlob(): Promise<
  string | null
> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const container = salesPlanBlobContainer();
  const blobPath = salesPlanDashboardJsonBlobPath();
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

export async function downloadSalesPlanDashboardJsonFromLocal(): Promise<
  string | null
> {
  const explicit = process.env.PUBLIC_SALES_PLAN_DASHBOARD_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "sales_plan_data.json"),
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
  return base.length > 0 ? base : "upload.xlsx";
}

export async function uploadSalesPlanIncomingFile(
  file: File,
  kind: "inv" | "ytd",
): Promise<{ container: string; blobPath: string }> {
  const svc = getBlobServiceClient();
  if (!svc) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }
  const container = salesPlanBlobContainer();
  const prefix =
    process.env.AZURE_SALES_PLAN_INCOMING_PREFIX?.trim() ||
    "sales-plan/incoming";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = sanitizeOriginalName(file.name);
  const blobPath = `${prefix}/${stamp}/${kind}/${safe}`;
  const block = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  const buf = Buffer.from(await file.arrayBuffer());
  await block.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: file.type || "application/octet-stream",
    },
  });
  return { container, blobPath };
}
