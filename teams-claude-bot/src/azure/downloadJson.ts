import { getBlobServiceClient } from "./blobClient.js";

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

/** Download JSON text from Azure Blob; null if storage unconfigured or blob missing. */
export async function downloadJsonFromBlob(
  container: string,
  blobPath: string,
): Promise<string | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToString(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}
