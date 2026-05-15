import { BlobServiceClient } from "@azure/storage-blob";

/** Server-only: Azure Storage connection string (from portal Storage Account → Access keys). */
export function getBlobServiceClient(): BlobServiceClient | null {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conn) return null;
  return BlobServiceClient.fromConnectionString(conn);
}
