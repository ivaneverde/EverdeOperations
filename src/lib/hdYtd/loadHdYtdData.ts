import { promises as fs } from "fs";
import { gunzipSync } from "zlib";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";

function containerName(): string {
  return (
    process.env.AZURE_SALES_PLAN_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

function blobPrefix(): string {
  return (
    process.env.AZURE_HD_YTD_BLOB_PREFIX?.trim() || "sales-plan/hd-ytd/latest"
  );
}

async function streamToBuffer(
  stream: NodeJS.ReadableStream | undefined,
): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadBlobBytes(blobName: string): Promise<Buffer | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const client = svc
    .getContainerClient(containerName())
    .getBlockBlobClient(`${blobPrefix()}/${blobName}`);
  try {
    const res = await client.download(0);
    return await streamToBuffer(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

export type HdYtdMeta = {
  sourceFile: string;
  sourcePath?: string;
  sheet?: string;
  asOf: string;
  generatedAt?: string;
  columns: string[];
  formats: string[];
  freezeColumns: number;
  totals: (string | number | null)[];
  rowCount: number;
  columnCount: number;
};

export type HdYtdCell = string | number | boolean | null;
export type HdYtdRow = HdYtdCell[];

type CacheState = {
  meta: HdYtdMeta | null;
  rows: HdYtdRow[] | null;
  loadedAt: number;
};

const g = globalThis as unknown as { __hdYtdCache?: CacheState };
function cache(): CacheState {
  if (!g.__hdYtdCache) {
    g.__hdYtdCache = { meta: null, rows: null, loadedAt: 0 };
  }
  return g.__hdYtdCache;
}

export async function loadHdYtdMeta(): Promise<HdYtdMeta | null> {
  const c = cache();
  if (c.meta) return c.meta;

  const fromBlob = await downloadBlobBytes("hd_ytd_meta.json");
  if (fromBlob) {
    c.meta = JSON.parse(fromBlob.toString("utf8")) as HdYtdMeta;
    return c.meta;
  }

  try {
    const local = await fs.readFile(
      path.join(process.cwd(), "public", "hd_ytd_meta.json"),
      "utf8",
    );
    c.meta = JSON.parse(local) as HdYtdMeta;
    return c.meta;
  } catch {
    return null;
  }
}

export async function loadHdYtdRows(): Promise<HdYtdRow[] | null> {
  const c = cache();
  if (c.rows) return c.rows;

  const fromBlob = await downloadBlobBytes("hd_ytd_rows.json.gz");
  if (fromBlob) {
    const json = gunzipSync(fromBlob).toString("utf8");
    c.rows = JSON.parse(json) as HdYtdRow[];
    c.loadedAt = Date.now();
    return c.rows;
  }

  try {
    const buf = await fs.readFile(
      path.join(process.cwd(), "public", "hd_ytd_rows.json.gz"),
    );
    const json = gunzipSync(buf).toString("utf8");
    c.rows = JSON.parse(json) as HdYtdRow[];
    c.loadedAt = Date.now();
    return c.rows;
  } catch {
    return null;
  }
}

export function clearHdYtdCache(): void {
  g.__hdYtdCache = { meta: null, rows: null, loadedAt: 0 };
}

/** Case-insensitive substring match on Market / Store / SKU columns. */
export function filterHdYtdRows(
  rows: HdYtdRow[],
  columns: string[],
  q: string,
): HdYtdRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  const idxs = columns
    .map((c, i) => ({ c: c.toLowerCase(), i }))
    .filter(
      ({ c }) =>
        c.includes("market") ||
        c.includes("store") ||
        c.includes("sku") ||
        c === "key",
    )
    .map(({ i }) => i);
  const use = idxs.length ? idxs : columns.map((_, i) => i).slice(0, 7);
  return rows.filter((row) =>
    use.some((i) => String(row[i] ?? "").toLowerCase().includes(needle)),
  );
}
