/**
 * Publish HD YTD meta + rows.gz to Azure Blob.
 *
 *   node scripts/sales-plan-review/publish-hd-ytd-data.mjs [meta.json] [rows.json.gz]
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
  process.env.AZURE_SALES_PLAN_BLOB_CONTAINER?.trim() ||
  process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
  "everde-freight";

const prefix =
  process.env.AZURE_HD_YTD_BLOB_PREFIX?.trim() || "sales-plan/hd-ytd/latest";

const repoPublic = path.join(process.cwd(), "public");
const metaPath = path.resolve(process.argv[2] || path.join(repoPublic, "hd_ytd_meta.json"));
const rowsPath = path.resolve(
  process.argv[3] || path.join(repoPublic, "hd_ytd_rows.json.gz"),
);
const catMapPath = path.resolve(
  process.argv[4] || path.join(repoPublic, "hd_sku_category_map.json"),
);

if (!fs.existsSync(metaPath) || !fs.existsSync(rowsPath)) {
  console.error("Missing meta or rows file:", metaPath, rowsPath);
  process.exit(1);
}

const svc = BlobServiceClient.fromConnectionString(conn);
const container = svc.getContainerClient(containerName);

async function upload(localPath, blobName, contentType) {
  const buf = fs.readFileSync(localPath);
  const client = container.getBlockBlobClient(`${prefix}/${blobName}`);
  await client.uploadData(buf, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  console.log(`Uploaded ${buf.length} bytes → ${containerName}/${prefix}/${blobName}`);
}

await upload(metaPath, "hd_ytd_meta.json", "application/json; charset=utf-8");
await upload(rowsPath, "hd_ytd_rows.json.gz", "application/gzip");
if (fs.existsSync(catMapPath)) {
  await upload(
    catMapPath,
    "hd_sku_category_map.json",
    "application/json; charset=utf-8",
  );
} else {
  console.warn(
    "No hd_sku_category_map.json — run build_ytd_sku_category_map.py (Plant Category from HD xref).",
  );
}
console.log("HD YTD Blob publish complete.");
