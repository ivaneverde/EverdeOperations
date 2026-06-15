import { parseInventoryMetricsFile } from "./parse-inventory-metrics.mjs";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const d = parseInventoryMetricsFile(file);

console.log("dwAgg:", d.dwAgg, "total:", d.dwTotal);
console.log("rdAgg:", d.rdAgg, "total:", d.rdTotal);
console.log("phAgg:", d.phAgg, "total:", d.phTotal);
console.log("meta revenue:", d.meta.totalRevenue);

const sample = (obj, keys) => keys.map((k) => obj[k]?.total ?? "—").join(" / ");
console.log("FOR demandWin:", sample(d.demandWin.FOR, ["missing", "past", "sellable", "readyAfter"]));
console.log("FOR readyDate:", sample(d.readyDate.FOR, ["noDate", "past", "future"]));
console.log("FOR photos:", sample(d.photos.FOR, ["current", "late", "no"]));
console.log("FOR ytdRevenue:", d.farmYTD.FOR?.ytdRevenue);
console.log("WIN ytdRevenue:", d.farmYTD.WIN?.ytdRevenue);

const farms = Object.keys(d.demandWin);
let gaps = 0;
for (const f of farms) {
  for (const k of ["missing", "past", "sellable", "readyAfter"]) {
    if (!d.demandWin[f][k]) gaps++;
  }
}
console.log("demandWin missing keys:", gaps);
