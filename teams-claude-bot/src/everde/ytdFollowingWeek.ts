import { gunzipSync } from "zlib";
import { downloadBytesFromBlob } from "../azure/downloadJson.js";
import { freightBlobContainer } from "../azure/blobPaths.js";
import {
  hdYtdRowsGzipPath,
  lowesYtdRowsGzipPath,
} from "../azure/blobPaths.js";
import { truncateText } from "./compact.js";

export type YtdKind = "hd" | "lowes";

type YtdCell = string | number | boolean | null;
type YtdRow = YtdCell[];

type CacheEntry = {
  columns: string[];
  rows: YtdRow[];
  loadedAt: number;
};

const g = globalThis as unknown as {
  __everdeYtdRowsCache?: Partial<Record<YtdKind, CacheEntry>>;
};

function cacheStore(): Partial<Record<YtdKind, CacheEntry>> {
  if (!g.__everdeYtdRowsCache) g.__everdeYtdRowsCache = {};
  return g.__everdeYtdRowsCache;
}

function rowsPath(kind: YtdKind): string {
  return kind === "lowes" ? lowesYtdRowsGzipPath() : hdYtdRowsGzipPath();
}

export async function loadYtdRowsCached(
  kind: YtdKind,
  columns: string[],
): Promise<YtdRow[] | null> {
  const store = cacheStore();
  const hit = store[kind];
  if (hit?.rows?.length) return hit.rows;

  const buf = await downloadBytesFromBlob(
    freightBlobContainer(),
    rowsPath(kind),
  );
  if (!buf) return null;
  try {
    const json = gunzipSync(buf).toString("utf8");
    const rows = JSON.parse(json) as YtdRow[];
    store[kind] = { columns, rows, loadedAt: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

export function filterYtdRows(
  rows: YtdRow[],
  columns: string[],
  q: string,
): YtdRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  const idxs = columns
    .map((c, i) => ({ c: c.toLowerCase(), i }))
    .filter(
      ({ c }) =>
        c.includes("market") ||
        c.includes("subregion") ||
        c.includes("store") ||
        c.includes("sku") ||
        c.includes("item") ||
        c === "key",
    )
    .map(({ i }) => i);
  const use = idxs.length ? idxs : columns.map((_, i) => i).slice(0, 7);
  return rows.filter((row) =>
    use.some((i) => String(row[i] ?? "").toLowerCase().includes(needle)),
  );
}

export function formatYtdSample(
  columns: string[],
  rows: YtdRow[],
  maxRows: number,
  maxChars: number,
): string {
  const sample = rows.slice(0, maxRows).map((row) => {
    const obj: Record<string, YtdCell> = {};
    for (let i = 0; i < Math.min(columns.length, 20); i++) {
      obj[columns[i]] = row[i] ?? null;
    }
    return obj;
  });
  return truncateText(
    JSON.stringify({
      returned: sample.length,
      columns_shown: columns.slice(0, 20),
      rows: sample,
    }),
    maxChars,
  );
}
