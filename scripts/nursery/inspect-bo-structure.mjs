import XLSX from "xlsx";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });
const bo = XLSX.utils.sheet_to_json(wb.Sheets["Backorders & Credit Summary"], {
  defval: "",
  header: 1,
});

console.log("Rows with col[1] farm/metric:");
for (let i = 0; i < bo.length; i++) {
  const c0 = String(bo[i][0] || "").trim();
  const c1 = String(bo[i][1] || "").trim();
  if (c1 && (c1.length <= 12 || c1 === "Grand Total")) {
    const ytdRev = bo[i][27];
    console.log(`R${i}: [0]${c0} [1]${c1} [27]${ytdRev}`);
  }
}
