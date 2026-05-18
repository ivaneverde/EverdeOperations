/**
 * Regenerate DEMAND pane in nursery-inventory-dashboard.html from Inventory Metrics xlsb.
 *
 * Usage:
 *   node scripts/nursery/refresh-nursery-demand.mjs [xlsb-path] [html-path]
 *
 * Defaults:
 *   xlsb → newest Inventory Metrics*.xlsb under DataDrops/Inventory Metrics/
 *   html → %USERPROFILE%/Documents/nursery-inventory-dashboard.html
 */
import fs from "fs";
import path from "path";
import { parseInventoryMetricsFile } from "./parse-inventory-metrics.mjs";

const dataRoot =
  process.env.PORTAL_DATA_ROOT?.trim() ||
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops";
const metricsDir = path.join(dataRoot, "Inventory Metrics");

function newestXlsb(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^Inventory Metrics.*\.xlsb$/i.test(f))
    .map((f) => {
      const p = path.join(dir, f);
      return { p, m: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.m - a.m);
  return files[0]?.p || null;
}

const xlsbPath = process.argv[2] || newestXlsb(metricsDir);
const htmlPath =
  process.argv[3] ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "Documents",
    "nursery-inventory-dashboard.html",
  );

if (!xlsbPath || !fs.existsSync(xlsbPath)) {
  console.error("Inventory Metrics xlsb not found:", xlsbPath || metricsDir);
  process.exit(1);
}
if (!fs.existsSync(htmlPath)) {
  console.error("HTML not found:", htmlPath);
  process.exit(1);
}

const baseName = path.basename(xlsbPath);
const demand = parseInventoryMetricsFile(xlsbPath, { sourceName: baseName });
const json = JSON.stringify(demand);
const safe = json.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let html = fs.readFileSync(htmlPath, "utf8");
const startMark = "// === DEMAND data (parsed from ";
const endMark = "function renderDemand()";
const startIdx = html.indexOf(startMark);
const endIdx = html.indexOf(endMark);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error("Could not find DEMAND block markers in HTML.");
  process.exit(1);
}

const newBlock = `// === DEMAND data (parsed from ${baseName}) ===
const DEMAND = JSON.parse(\`${safe}\`);

`;
html = html.slice(0, startIdx) + newBlock + html.slice(endIdx);

const periodNote = `YTD figures cover 2026 fiscal weeks ${demand.meta.weekStart}–${demand.meta.weekEnd}`;
const endLabel = new Date(`${demand.meta.reportDate}T12:00:00`).toLocaleDateString(
  "en-US",
  { month: "short", day: "numeric" },
);
const footerRe =
  /<p class="small">Source: <code>[^<]+<\/code> · 6 worksheets · parsed [^<]+\. [^<]+\.<\/p>/;
const footer = `<p class="small">Source: <code>${baseName}</code> · 6 worksheets · parsed ${demand.meta.reportDate}. ${periodNote} (Mar 1 → ${endLabel}). BO%, CR%, and goals are per-farm targets from the workbook; deltas are reported vs. each farm's own goal.</p>`;
if (!footerRe.test(html)) {
  console.warn("Footer line not updated (pattern mismatch).");
} else {
  html = html.replace(footerRe, footer);
}

fs.writeFileSync(htmlPath, html, "utf8");

const publicCopy = path.join(process.cwd(), "public", "nursery-inventory-dashboard.html");
try {
  fs.mkdirSync(path.dirname(publicCopy), { recursive: true });
  fs.copyFileSync(htmlPath, publicCopy);
  console.log("Copied to:", publicCopy);
} catch (e) {
  console.warn("Could not copy to public/:", e.message);
}

console.log("Updated:", htmlPath);
console.log(
  `  Revenue: $${(demand.meta.totalRevenue / 1e6).toFixed(2)}M | BO: $${(demand.meta.totalBO / 1e3).toFixed(0)}K | weeks ${demand.meta.weekStart}-${demand.meta.weekEnd}`,
);
