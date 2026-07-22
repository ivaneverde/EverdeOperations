/**
 * Extract nursery supply + demand JSON and publish to Azure Blob for portal + Teams bot.
 *
 * Usage (repo root, .env.local with AZURE_STORAGE_CONNECTION_STRING):
 *   npm run nursery:publish-blob
 *   npm run nursery:publish-blob -- path/to/XXTT_....xls
 *
 * Defaults:
 *   nursery/latest/nursery_supply_data.json
 *   nursery/latest/nursery_demand_data.json
 */
import { BlobServiceClient } from "@azure/storage-blob";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseSupplyPriceListFile } from "./parse-supply-price-list.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function loadDotEnvLocal() {
  const p = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

const DEMAND_NEEDLE = "const DEMAND = JSON.parse(`";

function extractDemandFromHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const start = html.indexOf(DEMAND_NEEDLE);
  if (start < 0) throw new Error(`DEMAND block not found in ${htmlPath}`);
  const jsonStart = start + DEMAND_NEEDLE.length;
  const close = html.indexOf("`)", jsonStart);
  if (close < 0) throw new Error("DEMAND close not found");
  const raw = html.slice(jsonStart, close).trim();
  JSON.parse(raw);
  return raw;
}

function newestSupplyXls(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.xls$/i.test(f) && !f.startsWith("~$"))
    .map((f) => {
      const p = path.join(dir, f);
      return { p, m: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.m - a.m);
  return files[0]?.p || null;
}

async function uploadJson(container, blobPath, text) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conn) throw new Error("Set AZURE_STORAGE_CONNECTION_STRING");
  const svc = BlobServiceClient.fromConnectionString(conn);
  const block = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  const buf = Buffer.from(text, "utf8");
  await block.uploadData(buf, {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
  console.log(`Uploaded ${buf.length} bytes → ${container}/${blobPath}`);
}

const dataRoot =
  process.env.PORTAL_DATA_ROOT?.trim() ||
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops";
const supplyDir = path.join(dataRoot, "Sales Inventory Availability");
const xlsArg = process.argv[2];
const xlsPath =
  xlsArg ||
  newestSupplyXls(supplyDir) ||
  path.join(
    process.env.USERPROFILE || "",
    "Downloads",
    "XXTT_INV_QA_LANDSCAPE_INV_PL_67738459_1.xls",
  );

const htmlPath = path.join(repoRoot, "public", "nursery-inventory-dashboard.html");
const container =
  process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
const supplyBlob =
  process.env.AZURE_NURSERY_SUPPLY_JSON_BLOB?.trim() ||
  "nursery/latest/nursery_supply_data.json";
const demandBlob =
  process.env.AZURE_NURSERY_DEMAND_JSON_BLOB?.trim() ||
  "nursery/latest/nursery_demand_data.json";

if (!xlsPath || !fs.existsSync(xlsPath)) {
  console.error("Supply XLS not found:", xlsPath);
  process.exit(1);
}
if (!fs.existsSync(htmlPath)) {
  console.error("Nursery HTML not found (need demand extract):", htmlPath);
  process.exit(1);
}

console.log("Parsing supply:", xlsPath);
const supply = parseSupplyPriceListFile(xlsPath, {
  sourceName: path.basename(xlsPath),
});
const supplyText = JSON.stringify(supply);
const demandText = extractDemandFromHtml(htmlPath);

const publicSupply = path.join(repoRoot, "public", "nursery-supply-data.json");
const publicDemand = path.join(repoRoot, "public", "nursery-demand-data.json");
fs.writeFileSync(publicSupply, supplyText, "utf8");
fs.writeFileSync(publicDemand, demandText, "utf8");
console.log("Wrote", publicSupply, `(${supplyText.length} chars, lines=${supply.lines?.length ?? 0})`);
console.log("Wrote", publicDemand, `(${demandText.length} chars)`);

await uploadJson(container, supplyBlob, supplyText);
await uploadJson(container, demandBlob, demandText);
console.log("Nursery supply + demand published to Blob.");
