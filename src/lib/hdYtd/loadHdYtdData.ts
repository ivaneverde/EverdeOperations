import { promises as fs } from "fs";
import { gunzipSync } from "zlib";
import path from "path";
import { getBlobServiceClient } from "@/lib/azure/blobClient";

export type YtdFollowingKind = "hd" | "lowes";

export type YtdMeta = {
  sourceFile: string;
  sourcePath?: string;
  sheet?: string;
  retailer?: string;
  asOf: string;
  generatedAt?: string;
  columns: string[];
  formats: string[];
  freezeColumns: number;
  totals: (string | number | null)[];
  rowCount: number;
  columnCount: number;
};

export type YtdCell = string | number | boolean | null;
export type YtdRow = YtdCell[];

type KindConfig = {
  blobPrefixEnv: string;
  defaultPrefix: string;
  metaFile: string;
  rowsFile: string;
  cacheKey: "__hdYtdCache" | "__lowesYtdCache";
};

const KIND_CONFIG: Record<YtdFollowingKind, KindConfig> = {
  hd: {
    blobPrefixEnv: "AZURE_HD_YTD_BLOB_PREFIX",
    defaultPrefix: "sales-plan/hd-ytd/latest",
    metaFile: "hd_ytd_meta.json",
    rowsFile: "hd_ytd_rows.json.gz",
    cacheKey: "__hdYtdCache",
  },
  lowes: {
    blobPrefixEnv: "AZURE_LOWES_YTD_BLOB_PREFIX",
    defaultPrefix: "sales-plan/lowes-ytd/latest",
    metaFile: "lowes_ytd_meta.json",
    rowsFile: "lowes_ytd_rows.json.gz",
    cacheKey: "__lowesYtdCache",
  },
};

function containerName(): string {
  return (
    process.env.AZURE_SALES_PLAN_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

function blobPrefix(kind: YtdFollowingKind): string {
  const cfg = KIND_CONFIG[kind];
  return process.env[cfg.blobPrefixEnv]?.trim() || cfg.defaultPrefix;
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

async function downloadBlobBytes(
  kind: YtdFollowingKind,
  blobName: string,
): Promise<Buffer | null> {
  const svc = getBlobServiceClient();
  if (!svc) return null;
  const client = svc
    .getContainerClient(containerName())
    .getBlockBlobClient(`${blobPrefix(kind)}/${blobName}`);
  try {
    const res = await client.download(0);
    return await streamToBuffer(res.readableStreamBody as NodeJS.ReadableStream);
  } catch {
    return null;
  }
}

type CacheState = {
  meta: YtdMeta | null;
  rows: YtdRow[] | null;
  loadedAt: number;
};

const g = globalThis as unknown as Record<string, CacheState | undefined>;

function cache(kind: YtdFollowingKind): CacheState {
  const key = KIND_CONFIG[kind].cacheKey;
  if (!g[key]) {
    g[key] = { meta: null, rows: null, loadedAt: 0 };
  }
  return g[key]!;
}

export async function loadYtdMeta(
  kind: YtdFollowingKind,
): Promise<YtdMeta | null> {
  const cfg = KIND_CONFIG[kind];
  const c = cache(kind);
  if (c.meta) return c.meta;

  const fromBlob = await downloadBlobBytes(kind, cfg.metaFile);
  if (fromBlob) {
    c.meta = JSON.parse(fromBlob.toString("utf8")) as YtdMeta;
    return c.meta;
  }

  try {
    const local = await fs.readFile(
      path.join(process.cwd(), "public", cfg.metaFile),
      "utf8",
    );
    c.meta = JSON.parse(local) as YtdMeta;
    return c.meta;
  } catch {
    return null;
  }
}

export async function loadYtdRows(
  kind: YtdFollowingKind,
): Promise<YtdRow[] | null> {
  const cfg = KIND_CONFIG[kind];
  const c = cache(kind);
  if (c.rows) return c.rows;

  const fromBlob = await downloadBlobBytes(kind, cfg.rowsFile);
  if (fromBlob) {
    const json = gunzipSync(fromBlob).toString("utf8");
    c.rows = JSON.parse(json) as YtdRow[];
    c.loadedAt = Date.now();
    return c.rows;
  }

  try {
    const buf = await fs.readFile(
      path.join(process.cwd(), "public", cfg.rowsFile),
    );
    const json = gunzipSync(buf).toString("utf8");
    c.rows = JSON.parse(json) as YtdRow[];
    c.loadedAt = Date.now();
    return c.rows;
  } catch {
    return null;
  }
}

export function clearYtdCache(kind?: YtdFollowingKind): void {
  const kinds: YtdFollowingKind[] = kind ? [kind] : ["hd", "lowes"];
  for (const k of kinds) {
    g[KIND_CONFIG[k].cacheKey] = { meta: null, rows: null, loadedAt: 0 };
  }
}

/** Case-insensitive substring match on geo / item / store columns. */
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

// Back-compat aliases used by HD routes
export type HdYtdMeta = YtdMeta;
export type HdYtdCell = YtdCell;
export type HdYtdRow = YtdRow;
export const loadHdYtdMeta = () => loadYtdMeta("hd");
export const loadHdYtdRows = () => loadYtdRows("hd");
export const clearHdYtdCache = () => clearYtdCache("hd");
export const filterHdYtdRows = filterYtdRows;
