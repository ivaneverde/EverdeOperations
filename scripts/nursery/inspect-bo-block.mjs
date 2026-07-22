import XLSX from "xlsx";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });
const bo = XLSX.utils.sheet_to_json(wb.Sheets["Backorders & Credit Summary"], {
  defval: "",
  header: 1,
});

const labels = ["BO", "CR", "REV", "PCT"];
for (let i = 4; i <= 7; i++) {
  const r = bo[i];
  console.log(`R${i} ${labels[i - 4]} [1]=${r[1]} cols 19-39:`);
  for (let c = 19; c <= 39; c++) {
    if (r[c] !== "" && r[c] != null) console.log(`  [${c}] ${r[c]}`);
  }
}

console.log("\nFOR block R20-23:");
for (let i = 20; i <= 23; i++) {
  const r = bo[i];
  console.log(`R${i} [1]=${r[1]} cols 19-39:`);
  for (let c = 19; c <= 39; c++) {
    if (r[c] !== "" && r[c] != null) console.log(`  [${c}] ${r[c]}`);
  }
}
