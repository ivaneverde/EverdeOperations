import XLSX from "xlsx";

const file =
  "\\\\192.168.190.10\\Claude Sandbox\\DataDrops\\Inventory Metrics\\Inventory Metrics 06 08 26.xlsb";
const wb = XLSX.readFile(file, { cellDates: true });
const bo = XLSX.utils.sheet_to_json(wb.Sheets["Backorders & Credit Summary"], {
  defval: "",
  header: 1,
});

for (let i = 0; i < bo.length; i++) {
  const farm = String(bo[i][19] || "").trim();
  if (farm && farm !== "Grand Total" && farm !== "2026") {
    console.log(
      `R${i} farm=${farm} bo=${bo[i][20]} cr=${bo[i][21]} ytdRev=${bo[i][27]} boPct=${bo[i][28]}`,
    );
  }
}
