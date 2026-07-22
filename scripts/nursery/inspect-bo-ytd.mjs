import XLSX from "xlsx";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });
const bo = XLSX.utils.sheet_to_json(wb.Sheets["Backorders & Credit Summary"], {
  defval: "",
  header: 1,
});

console.log("Row 2 headers (cols 19-40):");
for (let c = 19; c <= 40; c++) {
  const v = bo[2]?.[c];
  if (v !== "" && v != null) console.log(`  [${c}] ${v}`);
}

for (const farm of ["BNL", "FOR", "WIN"]) {
  for (let i = 4; i < bo.length; i += 4) {
    const f = String(bo[i][1] || "").trim();
    if (f !== farm) continue;
    console.log(`\n${farm} block at row ${i}:`);
    console.log("  BO row cols 16-40:", bo[i].slice(16, 41));
    console.log("  rev row cols 16-40:", bo[i + 2].slice(16, 41));
    break;
  }
}
