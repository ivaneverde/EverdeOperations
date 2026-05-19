/**
 * Publish local retail_opp_data.json to Azure Blob.
 *
 *   npm run publish:retail-json -- path/to/retail_opp_data.json
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
  process.env.AZURE_RETAIL_BLOB_CONTAINER?.trim() ||
  process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
  "everde-freight";
const blobPath =
  process.env.AZURE_RETAIL_DASHBOARD_JSON_BLOB?.trim() ||
  "retail-opportunity/latest/retail_opp_data.json";

const localPath = process.argv[2];
if (!localPath) {
  console.error(
    "Usage: npm run publish:retail-json -- <retail_opp_data.json>",
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

console.log(`Uploaded ${buf.length} bytes → ${containerName}/${blobPath}`);
