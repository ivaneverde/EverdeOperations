import { promises as fs } from "fs";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import {
  weatherBlobContainer,
  weatherDashboardJsonBlobPath,
} from "@/lib/azure/weatherBlobPaths";

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

export async function downloadWeatherDashboardJsonFromBlob(): Promise<
  string | null
> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const container = weatherBlobContainer();
  const blobPath = weatherDashboardJsonBlobPath();
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

export async function downloadWeatherDashboardJsonFromLocal(): Promise<
  string | null
> {
  const explicit = process.env.PUBLIC_WEATHER_DASHBOARD_JSON?.trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "public", "weather_dashboard_data.json"),
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
