/**
 * One-time bootstrap: extract inline `const D = {...}` from the NOR CAL HTML into
 * public/sales_plan_data.json (for local dev / first Blob publish).
 *
 * Usage: node scripts/sales-plan-review/bootstrap-json-from-html.mjs
 */
import fs from "fs";
import path from "path";

const htmlPath = path.join(
  process.cwd(),
  "public",
  "Everde_NOR_CAL_Sales_Plan_Dashboard.html",
);
const outPath = path.join(process.cwd(), "public", "sales_plan_data.json");

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
  console.error("Could not match braces for D object");
  process.exit(1);
}

const jsonText = html.slice(i, close + 1);
const data = JSON.parse(jsonText);
fs.writeFileSync(outPath, JSON.stringify(data));
console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
