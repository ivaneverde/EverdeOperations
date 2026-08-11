import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "everde", "hd_socal_store_roster.json");
const destDir = join(root, "dist", "everde");
const dest = join(destDir, "hd_socal_store_roster.json");

if (!existsSync(src)) {
  console.error("Missing", src);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("Copied", dest);
