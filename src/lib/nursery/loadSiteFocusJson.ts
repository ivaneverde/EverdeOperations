import { promises as fs } from "fs";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import { freightBlobContainer } from "@/lib/azure/freightBlobPaths";
import type { SiteFocusData } from "@/lib/nursery/siteFocus";

export function siteFocusJsonBlobPath(): string {
  return (
    process.env.AZURE_SITE_FOCUS_JSON_BLOB?.trim() ||
    "nursery/latest/site_focus_data.json"
  );
}

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

async function fromBlob(): Promise<string | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const client = svc
    .getContainerClient(freightBlobContainer())
    .getBlockBlobClient(siteFocusJsonBlobPath());
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

async function fromLocal(): Promise<string | null> {
  const candidates = [
    process.env.PUBLIC_SITE_FOCUS_JSON?.trim(),
    path.join(process.cwd(), "data", "site_focus_data.json"),
    path.join(process.cwd(), "public", "site_focus_data.json"),
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

export async function loadSiteFocusJson(): Promise<{
  data: SiteFocusData;
  json: string;
  source: "azure-blob" | "local-file";
} | null> {
  const blob = await fromBlob();
  const raw = blob ?? (await fromLocal());
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SiteFocusData;
    if (!Array.isArray(data?.regions)) return null;
    return {
      data,
      json: raw,
      source: blob ? "azure-blob" : "local-file",
    };
  } catch {
    return null;
  }
}
