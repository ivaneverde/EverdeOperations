/**
 * Merge weather crosswalk rows from Everde_Weather_Dashboard.html into retail_opp_data.json.
 *
 * Usage: node scripts/retail-opportunity/merge-weather-into-retail-json.mjs [retailJson] [weatherHtml]
 */
import fs from "fs";
import path from "path";

const retailPath =
  process.argv[2] ??
  path.join(process.cwd(), "public", "retail_opp_data.json");
const weatherHtmlPath =
  process.argv[3] ??
  path.join(process.cwd(), "public", "Everde_Weather_Dashboard.html");

if (!fs.existsSync(retailPath)) {
  console.error(`Retail JSON not found: ${retailPath}`);
  process.exit(1);
}
if (!fs.existsSync(weatherHtmlPath)) {
  console.error(`Weather HTML not found: ${weatherHtmlPath}`);
  process.exit(1);
}

const retail = JSON.parse(fs.readFileSync(retailPath, "utf8"));
const html = fs.readFileSync(weatherHtmlPath, "utf8");
const needle = "const WX = ";
const start = html.indexOf(needle);
if (start < 0) {
  console.error("const WX = not found in weather HTML");
  process.exit(1);
}

let i = start + needle.length;
while (i < html.length && /\s/.test(html[i])) i++;
if (html[i] !== "{") {
  console.error("Expected object after const WX =");
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
  console.error("Could not find end of WX object");
  process.exit(1);
}

const wx = JSON.parse(html.slice(i, close + 1));
const rows = Array.isArray(wx.crosswalk_rows) ? wx.crosswalk_rows : [];
retail.weather = rows;
fs.writeFileSync(retailPath, JSON.stringify(retail));
console.log(`Merged ${rows.length} weather crosswalk rows into ${retailPath}`);
