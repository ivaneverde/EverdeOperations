import { promises as fs } from "fs";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import {
  retailBlobContainer,
  retailDashboardJsonBlobPath,
} from "@/lib/azure/retailBlobPaths";

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

export async function downloadRetailDashboardJsonFromBlob(): Promise<
  string | null
> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const container = retailBlobContainer();
  const blobPath = retailDashboardJsonBlobPath();
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

export async function downloadRetailDashboardJsonFromLocal(): Promise<
  string | null
> {
  const explicit = process.env.PUBLIC_RETAIL_DASHBOARD_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "retail_opp_data.json"),
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
