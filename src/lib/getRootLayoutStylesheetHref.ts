import fs from "fs";
import path from "path";

const DEV_LAYOUT_CSS = "/_next/static/css/app/layout.css";

let cachedProdHref: string | null = null;

/**
 * Next may omit `<link rel="stylesheet">` from the initial HTML and rely on
 * client JS to attach global CSS. If that JS is slow or blocked, the portal
 * renders as unstyled markup. Reading the layout chunk list from the build
 * manifest yields a stable `/_next/static/css/...` URL for an explicit link.
 */
export function getRootLayoutStylesheetHref(): string {
  if (process.env.NODE_ENV === "development") {
    return DEV_LAYOUT_CSS;
  }

  if (cachedProdHref) {
    return cachedProdHref;
  }

  let href = DEV_LAYOUT_CSS;
  try {
    const manifestPath = path.join(
      process.cwd(),
      ".next",
      "app-build-manifest.json",
    );
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as { pages?: Record<string, string[]> };
    const chunks = manifest.pages?.["/layout"];
    const cssChunk = chunks?.find(
      (c) => c.startsWith("static/css/") && c.endsWith(".css"),
    );
    if (cssChunk) {
      href = `/_next/${cssChunk}`;
    }
  } catch {
    /* manifest missing — unlikely in production after `next build` */
  }

  cachedProdHref = href;
  return href;
}
