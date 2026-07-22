import XLSX from "xlsx";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });

for (const name of ["DMND Window Summary", "Ready Date Summary", "Photo Summary"]) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", header: 1 });
  console.log(`\n=== ${name} rows 7-25 ===`);
  for (let i = 7; i <= 25; i++) {
    const r = rows[i] || [];
    const cells = [];
    [0, 1, 2, 3, 18].forEach((c) => {
      if (r[c] !== "" && r[c] != null) cells.push(`[${c}]${r[c]}`);
    });
    if (cells.length) console.log(`R${i}: ${cells.join(" ")}`);
  }
  console.log(`\n=== ${name} rows 65-85 ===`);
  for (let i = 65; i <= 85; i++) {
    const r = rows[i] || [];
    const cells = [];
    [0, 1, 2, 3, 18].forEach((c) => {
      if (r[c] !== "" && r[c] != null) cells.push(`[${c}]${r[c]}`);
    });
    if (cells.length) console.log(`R${i}: ${cells.join(" ")}`);
  }
}
