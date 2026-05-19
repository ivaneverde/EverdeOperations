/**
 * Bootstrap public/retail_opp_data.json from inline `const D` in the retail HTML.
 *
 * Usage: node scripts/retail-opportunity/bootstrap-json-from-html.mjs
 */
import fs from "fs";
import path from "path";

const htmlPath = path.join(
  process.cwd(),
  "public",
  "Everde_West_Coast_Retail_Opportunity_Dashboard.html",
);
const outPath = path.join(process.cwd(), "public", "retail_opp_data.json");

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

const json = html.slice(i, close + 1);
JSON.parse(json);
fs.writeFileSync(outPath, json);
console.log(`Wrote ${outPath} (${json.length} chars)`);
