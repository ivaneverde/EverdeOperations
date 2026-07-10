/**
 * Replace inline `const D = {...}` in the retail HTML with public/retail_opp_data.json.
 *
 * Usage: node scripts/retail-opportunity/inject-json-into-html.mjs [jsonPath]
 */
import fs from "fs";
import path from "path";

const htmlPath = path.join(
  process.cwd(),
  "public",
  "Everde_West_Coast_Retail_Opportunity_Dashboard.html",
);
const jsonPath =
  process.argv[2] ??
  path.join(process.cwd(), "public", "retail_opp_data.json");

if (!fs.existsSync(jsonPath)) {
  console.error(`JSON not found: ${jsonPath}`);
  process.exit(1);
}
if (!fs.existsSync(htmlPath)) {
  console.error(`HTML not found: ${htmlPath}`);
  process.exit(1);
}

const rawJson = fs.readFileSync(jsonPath, "utf8");
const parsed = JSON.parse(rawJson);

/** Keys referenced by Everde_West_Coast_Retail_Opportunity_Dashboard.html. */
const DASHBOARD_KEYS = [
  "meta",
  "key_numbers",
  "headline",
  "region_crosstab",
  "action_buckets",
  "top30_ship_now",
  "top30_behind_plan",
  "ship_now_by_retailer",
  "top20_stores",
  "all_stores",
  "miss_analysis",
  "for_source",
  "region_comparison",
  "weather",
];

function slimRetailerDetail(block) {
  if (!block || typeof block !== "object") return block;
  const out = { ...block };
  for (const key of Object.keys(out)) {
    if (key.startsWith("stores_") && Array.isArray(out[key])) {
      out[key] = out[key].slice(0, 80);
    }
    if (key.startsWith("items_") && Array.isArray(out[key])) {
      out[key] = out[key].slice(0, 150);
    }
  }
  return out;
}

const dashboard = {};
for (const key of DASHBOARD_KEYS) {
  if (key in parsed) dashboard[key] = parsed[key];
}
if (parsed.hd) dashboard.hd = slimRetailerDetail(parsed.hd);
if (parsed.lowes) dashboard.lowes = slimRetailerDetail(parsed.lowes);

const compact = JSON.stringify(dashboard);

const html = fs.readFileSync(htmlPath, "utf8");
const needle = "const D = ";
const start = html.indexOf(needle);
if (start < 0) {
  console.error("const D = not found in HTML");
  process.exit(1);
}

let i = start + needle.length;
while (i < html.length && /[\s\r\n]/.test(html[i])) i++;
if (html[i] !== "{") {
  console.error("Expected object after const D =");
  process.exit(1);
}

function findClose(open) {
  let depth = 0;
  let inStr = null;
  for (let j = open; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (c === "\\") {
        j++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

const close = findClose(i);
if (close < 0) {
  console.error("Could not find end of D object");
  process.exit(1);
}

const next = `${html.slice(0, start)}const D = ${compact};${html.slice(close + 1)}`;
fs.writeFileSync(htmlPath, next);

const storeCount =
  Array.isArray(dashboard.all_stores) && dashboard.all_stores.length > 0
    ? dashboard.all_stores.length
    : Array.isArray(dashboard.top20_stores)
      ? dashboard.top20_stores.length
      : 0;

console.log(
  `Updated ${htmlPath} (${compact.length} chars, ${storeCount} stores in dataset)`,
);
