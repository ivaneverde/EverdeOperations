import { getBlobServiceClient } from "./blobClient.js";

async function streamToBuffer(
  stream: NodeJS.ReadableStream | undefined,
): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function streamToString(
  stream: NodeJS.ReadableStream | undefined,
): Promise<string> {
  return (await streamToBuffer(stream)).toString("utf8");
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

/** Download raw bytes from Azure Blob (e.g. gzip). */
export async function downloadBytesFromBlob(
  container: string,
  blobPath: string,
): Promise<Buffer | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  try {
    const res = await client.download(0);
    return await streamToBuffer(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}
