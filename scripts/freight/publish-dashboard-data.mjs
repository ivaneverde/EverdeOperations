/**
 * Publish local dashboard_data.json to Azure Blob (same path the portal reads).
 *
 * Usage (from repo root, after extract_data.py):
 *   set AZURE_STORAGE_CONNECTION_STRING=...   (Windows: $env:...=...)
 *   npm run publish:freight-json -- path/to/dashboard_data.json
 *
 * Optional env: AZURE_FREIGHT_BLOB_CONTAINER (default everde-freight),
 *               AZURE_FREIGHT_DASHBOARD_JSON_BLOB (default freight/latest/dashboard_data.json)
 */
import { BlobServiceClient } from "@azure/storage-blob";
import fs from "fs";
import path from "path";

const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
if (!conn) {
  console.error("Set AZURE_STORAGE_CONNECTION_STRING");
  process.exit(1);
}

const containerName =
  process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
const blobPath =
  process.env.AZURE_FREIGHT_DASHBOARD_JSON_BLOB?.trim() ||
  "freight/latest/dashboard_data.json";

const localPath = process.argv[2];
if (!localPath) {
  console.error(
    "Usage: npm run publish:freight-json -- <dashboard_data.json>",
  );
  process.exit(1);
}

const abs = path.resolve(localPath);
const buf = fs.readFileSync(abs);
const svc = BlobServiceClient.fromConnectionString(conn);
const block = svc.getContainerClient(containerName).getBlockBlobClient(blobPath);

await block.uploadData(buf, {
  blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
});

console.log(
  `Uploaded ${buf.length} bytes → ${containerName}/${blobPath}`,
);
