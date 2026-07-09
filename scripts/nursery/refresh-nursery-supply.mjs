/**
 * Regenerate SUPPLY pane in nursery-inventory-dashboard.html from price list xls.
 */
import fs from "fs";
import path from "path";
import { parseSupplyPriceListFile } from "./parse-supply-price-list.mjs";

const dataRoot =
  process.env.PORTAL_DATA_ROOT?.trim() ||
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops";
const supplyDir = path.join(dataRoot, "Sales Inventory Availability");

function newestXls(dir) {
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

function fmtMoney(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct1(n) {
  return `${n.toFixed(1)}%`;
}


function patchSupplyPane(html, data) {
  const paneStart = html.indexOf('<div id="report-supply"');
  const paneEnd = html.indexOf("</div><!-- /#report-supply -->");
  if (paneStart < 0 || paneEnd < 0) {
    throw new Error("Could not locate report-supply pane in HTML.");
  }

  let supply = html.slice(paneStart, paneEnd);
  const m = data.meta;

  const endLabel = new Date(`${m.reportDate}T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
  const sub = `${fmtMoney(m.totalRevenuePot)} revenue potential · ${m.farmCount} farms · ${fmtInt(m.rowCount)} line items (${endLabel} snapshot). Saleable inventory, demand-window vs ready-date alignment, grade mix, and action lists from the weekly price list.`;
  supply = supply.replace(/<p class="sub">[\s\S]*?<\/p>/, `<p class="sub">${sub}</p>`);

  const statBlock = `<section class="grid grid-5">
    <div class="stat info"><div class="v">${fmtMoney(m.totalRevenuePot)}</div><div class="l">Revenue potential</div></div>
    <div class="stat"><div class="v">${fmtInt(m.totalSaleable)}</div><div class="l">Saleable units</div></div>
    <div class="stat"><div class="v">${fmtInt(m.skuCount)}</div><div class="l">SKUs · ${fmtInt(m.productCount)} products</div></div>
    <div class="stat"><div class="v">${m.farmCount}</div><div class="l">Farms · ${m.regionCount} regions</div></div>
    <div class="stat warning"><div class="v">${fmtMoney(m.agingValue)}</div><div class="l">Aging stock value</div></div>
  </section>`;
  supply = supply.replace(
    /<section class="grid grid-5">[\s\S]*?<\/section>/,
    statBlock,
  );

  const supplyCallout = `<section class="section grid" style="gap: 12px;">
    <div class="callout info">
      <div class="t">Supply snapshot: <em>units · value · timing risk</em></div>
      <strong>Units:</strong> ${fmtInt(m.totalSaleable)} saleable across ${m.farmCount} farms (${fmtInt(m.productCount)} botanical products).
      <strong>Value:</strong> ${fmtMoney(m.totalRevenuePot)} revenue potential at list price.
      <strong>Timing:</strong> ${fmtMoney(m.agingValue)} aging (${fmtInt(m.agingRowCount)} rows) · ${fmtInt(m.lateQty)} units ready late vs demand windows.
    </div>
  </section>`;
  supply = supply.replace(
    /<section class="section grid" style="gap: 12px;">[\s\S]*?<\/section>/,
    supplyCallout,
  );

  const gradeA = data.grades.A?.saleable || 0;
  const gradeSS = data.grades.SS?.saleable || 0;
  const gradeTotal = Object.values(data.grades).reduce(
    (s, g) => s + (g.saleable || 0),
    0,
  );
  const gradeAPct = gradeTotal > 0 ? (gradeA / gradeTotal) * 100 : 0;
  const gradeSSPct = gradeTotal > 0 ? (gradeSS / gradeTotal) * 100 : 0;
  supply = supply.replace(
    /(<h2>Plant grade mix<\/h2>\s*<p class="sub">)[\s\S]*?(<\/p>)/,
    `$1Grade A is the premium saleable tier; SS (small/seedling) is propagation stock; GS, B, C are graded but lower spec. Across the network, <strong>${fmtPct1(gradeAPct)}</strong> of saleable units are grade A and <strong>${fmtPct1(gradeSSPct)}</strong> are SS.$2`,
  );

  const txRev = data.regions.TX?.revenuePot || 0;
  const socFarms = Object.entries(data.farmConsumption).filter(
    ([, v]) => v.region === "SOCAL",
  ).length;
  supply = supply.replace(
    /<p class="small" style="margin-top: 8px;">Texas \(GFL \+ MCR\)[\s\S]*?<\/p>/,
    `<p class="small" style="margin-top: 8px;">Texas (GFL + MCR) holds ${fmtMoney(txRev)} of revenue potential. SoCal has ${socFarms} farms in this extract.</p>`,
  );

  const h1 = data.demandReadyMatch["2026 HALF 1"];
  if (h1 && h1.totalSaleable > 0) {
    const onPct = ((h1.readyOnTime / h1.totalSaleable) * 100).toFixed(0);
    const noDatePct = ((h1.noReadyDate / h1.totalSaleable) * 100).toFixed(0);
    const topAging = data.agingStock[0];
    const topLate = data.lateReady[0];
    const cards = `      <div class="card">
        <div class="head"><span>Reroute on-time stock to active sales</span><span class="pill success">Pull supply forward</span></div>
        <div class="body">${fmtInt(h1.readyOnTime)} units (${onPct}%) are ready in time for the 2026 H1 demand window — push these into the active sales pipeline first.</div>
      </div>
      <div class="card">
        <div class="head"><span>Re-classify "ready late" stock</span><span class="pill warning">Re-time</span></div>
        <div class="body">${fmtInt(h1.readyLate)} units won't be ready inside the 2026 H1 window — either reslot to 2026 H2 demand or accept a late-ship penalty.${topLate ? ` Top offender: ${topLate.common} at ${topLate.farm}.` : ""}</div>
      </div>
      <div class="card">
        <div class="head"><span>Fill ${fmtInt(h1.noReadyDate)} units missing ready dates</span><span class="pill info">Backfill plan</span></div>
        <div class="body">${noDatePct}% of 2026 H1 saleable supply has no ready date — adding dates turns hidden capacity into committable inventory.</div>
      </div>
      <div class="card">
        <div class="head"><span>Move ${fmtMoney(m.agingValue)} of aging stock</span><span class="pill danger">Promote / discount</span></div>
        <div class="body">${fmtInt(m.agingRowCount)} rows have ready dates in the past with stock still on hand.${topAging ? ` ${topAging.farm}'s ${topAging.common} ${topAging.size} alone is ${fmtMoney(topAging.value)} of aging value.` : ""}</div>
      </div>
      <div class="card">
        <div class="head"><span>Replenish high-value shortages</span><span class="pill danger">Replenish</span></div>
        <div class="body">${m.shortageCount}+ items priced ≥ $25 each have fewer than 25 saleable units against active demand windows — revenue-blockers for high-spec lines.</div>
      </div>
      <div class="card">
        <div class="head"><span>Reconcile ${m.oversoldRowCount} oversold rows</span><span class="pill danger">Resolve</span></div>
        <div class="body">Negative saleable counts mean over-allocation — ${fmtInt(m.oversoldUnits)} units committed beyond stock on hand. Review the largest exposures in the Over-committed tab.</div>
      </div>`;
    supply = supply.replace(
      /(<section class="section">\s*<h2>Where to focus next<\/h2>\s*<div class="grid grid-2" style="margin-top: 12px;">)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1\n${cards}\n    $2`,
    );
  }

  const footer = `<footer class="section">
    <p class="small">Source: <code>${m.sourceName}</code> · ${fmtInt(m.rowCount)} rows × ${m.columnCount} columns · parsed ${m.reportDate}. Aging cutoff: ready date before parse date. Late = ready date after demand window's last day. Consumption % = max(0, graded − saleable) / graded.</p>
    <p class="small muted">To enable real "what's selling" rather than supply health, attach a sales/orders export with shipped quantities and dates.</p>
  </footer>`;
  supply = supply.replace(/<footer class="section">[\s\S]*?<\/footer>/, footer);

  return html.slice(0, paneStart) + supply + html.slice(paneEnd);
}

function injectSupplyCopy(html, data) {
  return patchSupplyPane(html, data);
}

const xlsPath = process.argv[2] || newestXls(supplyDir);
const htmlPath =
  process.argv[3] ||
  (() => {
    const docs = path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      "Documents",
      "nursery-inventory-dashboard.html",
    );
    if (fs.existsSync(docs)) return docs;
    return path.join(process.cwd(), "public", "nursery-inventory-dashboard.html");
  })();

if (!xlsPath || !fs.existsSync(xlsPath)) {
  console.error("Supply price list xls not found:", xlsPath || supplyDir);
  process.exit(1);
}
if (!fs.existsSync(htmlPath)) {
  console.error("HTML not found:", htmlPath);
  process.exit(1);
}

const baseName = path.basename(xlsPath);
const data = parseSupplyPriceListFile(xlsPath, { sourceName: baseName });
const dataBlock = JSON.stringify(data, null, 2);

let html = fs.readFileSync(htmlPath, "utf8");
const startIdx = html.indexOf("const DATA = {");
const tailMarker = "// === Formatting helpers ===";
const tailIdx = html.indexOf(tailMarker);
if (startIdx < 0 || tailIdx < 0) {
  console.error("Could not find DATA block in HTML.");
  process.exit(1);
}

html =
  html.slice(0, startIdx) +
  `const DATA = ${dataBlock};\n\n` +
  html.slice(tailIdx);
html = injectSupplyCopy(html, data);

fs.writeFileSync(htmlPath, html, "utf8");

const publicCopy = path.join(
  process.cwd(),
  "public",
  "nursery-inventory-dashboard.html",
);
fs.mkdirSync(path.dirname(publicCopy), { recursive: true });
fs.copyFileSync(htmlPath, publicCopy);
console.log("Copied to:", publicCopy);
console.log("Updated:", htmlPath);
console.log(
  `  Saleable: ${fmtInt(data.meta.totalSaleable)} | Revenue pot: ${fmtMoney(data.meta.totalRevenuePot)} | Aging: ${fmtMoney(data.meta.agingValue)}`,
);
