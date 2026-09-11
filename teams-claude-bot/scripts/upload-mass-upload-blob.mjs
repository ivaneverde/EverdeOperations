import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";

function loadEnv(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore missing
  }
}

const root = resolve(import.meta.dirname, "..");
loadEnv(resolve(root, ".env"));
loadEnv(resolve(root, "../.env.local"));

const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!conn) {
  console.error("AZURE_STORAGE_CONNECTION_STRING missing");
  process.exit(1);
}

const filePath =
  process.argv[2] ||
  resolve(root, "../_incoming/WCRO_NCA_HD_MassUpload_Bot.xlsm");
const blobPath =
  process.argv[3] || "wcro/mass-upload/latest/HD_NCA_MassUpload.xlsm";
const buf = readFileSync(filePath);
const container =
  process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
const svc = BlobServiceClient.fromConnectionString(conn);
const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
await client.uploadData(buf, {
  blobHTTPHeaders: {
    blobContentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
  },
});
console.log(`Uploaded ${buf.length} bytes → ${container}/${blobPath}`);
