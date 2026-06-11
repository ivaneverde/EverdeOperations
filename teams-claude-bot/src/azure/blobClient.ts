import { BlobServiceClient } from "@azure/storage-blob";

let cached: BlobServiceClient | null | undefined;

export function getBlobServiceClient(): BlobServiceClient | null {
  if (cached !== undefined) return cached;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conn) {
    cached = null;
    return null;
  }
  cached = BlobServiceClient.fromConnectionString(conn);
  return cached;
}
