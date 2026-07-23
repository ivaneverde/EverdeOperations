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

/** Pad HD market/district/store codes to 4 digits when numeric. */
function padHdCode(raw: string): string {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s) && s.length <= 4) return s.padStart(4, "0");
  return s;
}

function colIndex(columns: string[], ...needles: string[]): number {
  const lower = columns.map((c) => c.toLowerCase());
  for (const n of needles) {
    const i = lower.findIndex((c) => c === n || c.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function cellEqCode(cell: YtdCell, code: string): boolean {
  const a = padHdCode(String(cell ?? ""));
  const b = padHdCode(code);
  return a === b || String(cell ?? "").trim() === code.trim();
}

/**
 * Filter HD/Lowe's YTD rows.
 * Exact Market / District / Store / SKU matches when query looks like
 * "market 48", "district 25", "store 614" (4-digit padded).
 */
export function filterYtdRows(
  rows: YtdRow[],
  columns: string[],
  q: string,
): YtdRow[] {
  const raw = q.trim();
  if (!raw) return rows;

  const marketI = colIndex(columns, "market nbr", "market");
  const districtI = colIndex(columns, "district nbr", "district");
  const storeI = colIndex(columns, "store nbr");
  const storeNameI = colIndex(columns, "store name");
  const skuI = colIndex(columns, "sku nbr", "item");
  const skuNameI = colIndex(columns, "sku name", "item name", "desc");
  const subregionI = colIndex(columns, "subregion");

  let market: string | undefined;
  let district: string | undefined;
  let store: string | undefined;
  let sku: string | undefined;
  let rest = raw;

  const take = (re: RegExp, set: (v: string) => void) => {
    const m = rest.match(re);
    if (!m) return;
    set(padHdCode(m[1]));
    rest = rest.replace(m[0], " ");
  };
  take(/\bmarkets?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, (v) => {
    market = v;
  });
  take(/\bdistricts?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, (v) => {
    district = v;
  });
  take(/\bstores?\s*(?:nbr|number|#|:)?\s*(\d{1,4})\b/i, (v) => {
    store = v;
  });
  take(/\bskus?\s*(?:nbr|number|#|:)?\s*(\d{4,8})\b/i, (v) => {
    sku = v;
  });

  const bare = !market && !district && !store && !sku ? raw.match(/^#?(\d{1,4})$/) : null;
  const bareCode = bare ? padHdCode(bare[1]) : null;
  const text = rest
    .toLowerCase()
    .split(/[\s,/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!market && !district && !store && !sku && !bareCode) {
    // Legacy substring search on geo/name columns only (not SKU nbr alone for short needles)
    const idxs = columns
      .map((c, i) => ({ c: c.toLowerCase(), i }))
      .filter(
        ({ c }) =>
          c.includes("market") ||
          c.includes("subregion") ||
          c.includes("store") ||
          c.includes("sku name") ||
          c.includes("item name") ||
          c === "key",
      )
      .map(({ i }) => i);
    const use = idxs.length ? idxs : columns.map((_, i) => i).slice(0, 7);
    const needle = raw.toLowerCase();
    return rows.filter((row) =>
      use.some((i) => String(row[i] ?? "").toLowerCase().includes(needle)),
    );
  }

  return rows.filter((row) => {
    if (market && marketI >= 0 && !cellEqCode(row[marketI], market)) return false;
    if (district && districtI >= 0 && !cellEqCode(row[districtI], district))
      return false;
    if (store && storeI >= 0 && !cellEqCode(row[storeI], store)) return false;
    if (sku && skuI >= 0 && !cellEqCode(row[skuI], sku)) return false;
    if (bareCode) {
      const hit =
        (storeI >= 0 && cellEqCode(row[storeI], bareCode)) ||
        (marketI >= 0 && cellEqCode(row[marketI], bareCode)) ||
        (districtI >= 0 && cellEqCode(row[districtI], bareCode));
      if (!hit) return false;
    }
    if (text.length === 0) return true;
    const hay = [
      storeNameI >= 0 ? row[storeNameI] : "",
      skuNameI >= 0 ? row[skuNameI] : "",
      subregionI >= 0 ? row[subregionI] : "",
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" | ");
    return text.every((t) => hay.includes(t));
  });
}

// Back-compat aliases used by HD routes
export type HdYtdMeta = YtdMeta;
export type HdYtdCell = YtdCell;
export type HdYtdRow = YtdRow;
export const loadHdYtdMeta = () => loadYtdMeta("hd");
export const loadHdYtdRows = () => loadYtdRows("hd");
export const clearHdYtdCache = () => clearYtdCache("hd");
export const filterHdYtdRows = filterYtdRows;
