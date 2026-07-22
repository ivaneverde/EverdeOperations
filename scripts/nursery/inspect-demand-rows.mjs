import XLSX from "xlsx";

const file =
  process.argv[2] ||
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });

for (const name of ["DMND Window Summary", "Ready Date Summary", "Photo Summary"]) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", header: 1 });
  console.log(`\n--- ${name} ---`);
  const types = new Set();
  for (let i = 0; i < rows.length; i++) {
    const farm = String(rows[i][2] || "").trim();
    const type = String(rows[i][3] || "").trim();
    if (type) types.add(type);
    if (farm && type && i < 80) {
      console.log(`R${i} farm=${farm} type=${type} total=${rows[i][18]}`);
    }
  }
  console.log("Unique types:", [...types].join(" | "));
}
