/**
 * Regenerate DEMAND pane in nursery-inventory-dashboard.html from Inventory Metrics xlsb.
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

function fmtMoney(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct1(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function injectDemandCopy(html, demand) {
  const endLabel = new Date(`${demand.meta.reportDate}T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );
  const sub = `${fmtMoney(demand.meta.totalRevenue)} YTD revenue · ${demand.meta.farmCount} farms · weeks ${demand.meta.weekStart}–${demand.meta.weekEnd} (Mar 1 → ${endLabel}, 2026). Operational report covering grading variance, backorders &amp; credits, demand-window allocation, ready-date pipeline, photo readiness and cycle counts.`;
  html = html.replace(/<p class="sub">[^<]*<\/p>/, `<p class="sub">${sub}</p>`);

  const systemEu = Object.values(demand.variance).reduce(
    (s, v) => s + (v.systemEU || 0),
    0,
  );
  const txRev =
    (demand.farmYTD.GFL?.ytdRevenue || 0) + (demand.farmYTD.MCR?.ytdRevenue || 0);
  const activeWeeks = demand.weeklyTotals.revenue.filter((v) => v > 0).length;
  const wkRate =
    activeWeeks > 0
      ? demand.weeklyTotals.revenue.reduce((a, b) => a + b, 0) / activeWeeks
      : 0;

  const calloutFixed = [
    '    <motion>',
    '      <motion>',
    `      <strong>Have:</strong> ${demand.cycleAgg.startQty.toLocaleString("en-US")} graded items on hand across ${demand.meta.farmCount} farms, with ${fmtMoney(systemEu)} of system EU value.`,
    `      <strong>Sell:</strong> ${fmtMoney(demand.meta.totalRevenue)} YTD revenue over ${activeWeeks} weeks (~${fmtMoney(wkRate)} / wk run-rate). Texas leads at ${fmtMoney(txRev)} YTD.`,
    `      <strong>Need more of:</strong> ${fmtMoney(demand.meta.totalBO)} of demand <em>backordered</em> (${fmtPct1(demand.meta.boPct)}) plus ${fmtMoney(demand.meta.totalCR)} issued as credits (${fmtPct1(demand.meta.crPct)}) - see reason codes below.`,
    "    </div>",
  ]
    .join("\n")
    .replace(
      "    <motion>",
      '    <div class="callout info">',
    )
    .replace(
      "      <motion>",
      '      <div class="t">The demand plan in three pieces: <em>have · sell · need more of</em></div>',
    );

  html = html.replace(
    /<div class="callout info">[\s\S]*?<\/div>\s*\n\s*<\/section>\s*\n\s*<hr\/>/,
    `${calloutFixed}\n  </section>\n\n  <hr/>`,
  );

  return html;
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

html =
  html.slice(0, startIdx) +
  `// === DEMAND data (parsed from ${baseName}) ===\nconst DEMAND = JSON.parse(\`${safe}\`);\n\n` +
  html.slice(endIdx);
html = injectDemandCopy(html, demand);

const periodNote = `YTD figures cover 2026 fiscal weeks ${demand.meta.weekStart}–${demand.meta.weekEnd}`;
const endLabel = new Date(`${demand.meta.reportDate}T12:00:00`).toLocaleDateString(
  "en-US",
  { month: "short", day: "numeric" },
);
const footerRe =
  /<p class="small">Source: <code>[^<]+<\/code> · 6 worksheets · parsed [^<]+\. [^<]+\.<\/p>/;
const footer = `<p class="small">Source: <code>${baseName}</code> · 6 worksheets · parsed ${demand.meta.reportDate}. ${periodNote} (Mar 1 → ${endLabel}). BO%, CR%, and goals are per-farm targets from the workbook; deltas are reported vs. each farm's own goal.</p>`;
if (footerRe.test(html)) {
  html = html.replace(footerRe, footer);
}

fs.writeFileSync(htmlPath, html, "utf8");

const publicCopy = path.join(process.cwd(), "public", "nursery-inventory-dashboard.html");
fs.mkdirSync(path.dirname(publicCopy), { recursive: true });
fs.copyFileSync(htmlPath, publicCopy);
console.log("Copied to:", publicCopy);
console.log("Updated:", htmlPath);
console.log(
  `  Revenue: $${(demand.meta.totalRevenue / 1e6).toFixed(2)}M | BO: $${(demand.meta.totalBO / 1e3).toFixed(0)}K | weeks ${demand.meta.weekStart}-${demand.meta.weekEnd}`,
);
