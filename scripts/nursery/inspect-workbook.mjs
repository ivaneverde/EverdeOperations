/**
 * Quick sheet/column inspection for Inventory Metrics xlsb.
 * Usage: node scripts/nursery/inspect-workbook.mjs [path-to-xlsb]
 */
import XLSX from "xlsx";
import path from "path";

const defaultPath =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 05 18 26.xlsb";
const file = process.argv[2] || defaultPath;

const wb = XLSX.readFile(file, { cellDates: true });
console.log("File:", file);
console.log("Sheets:", wb.SheetNames.join(" | "));

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    defval: "",
    header: 1,
  });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const cells = [];
    (rows[r] || []).forEach((v, i) => {
      if (v !== "" && v !== 0) cells.push(`[${i}]${v}`);
    });
    if (cells.length) console.log(`  R${r}: ${cells.slice(0, 12).join("  ")}`);
  }
}
