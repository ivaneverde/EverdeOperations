import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadBytesFromBlob,
  uploadBytesToBlob,
} from "../azure/downloadJson.js";
import { freightBlobContainer, massUploadLatestBlobPath } from "../azure/blobPaths.js";
import { logger } from "../utils/logger.js";
import type { BotProfile } from "./botProfile.js";

/**
 * Exact phrase gate (case-insensitive). Must appear in the user message.
 *
 * Citrus / N.CA xref / dup-SKU filters live only in scripts/wcro/build_mass_upload.py
 * (and the Blob files it publishes). They do NOT apply to get_wcro_dashboard or
 * extract_wcro — WCRO answers still include citrus and full Store Driven lines.
 */
export const MASS_UPLOAD_PHRASE = "generate a mass upload";

/** Temporary tester allowlist — expand later. */
const MASS_UPLOAD_ALLOWED_EMAILS = new Set(["isunderland@everde.com"]);

export type MassUploadRequest = {
  region: string;
  channel: "HD" | "LOW";
  reqDeliveryDate: Date | null;
  orderType: string;
  shipInstr: string;
};

export function messageRequestsMassUpload(text: string): boolean {
  return text.toLowerCase().includes(MASS_UPLOAD_PHRASE);
}

export function canUseMassUpload(email: string | null | undefined): boolean {
  if (!email) return false;
  return MASS_UPLOAD_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Channel defaults from bot profile so HD / Lowes bots don't need retailer named.
 * @Claude (full) still parses HD vs Lowes from the message (default HD).
 */
export function channelForProfile(
  profile: BotProfile,
  text: string,
): "HD" | "LOW" {
  if (profile === "hd") return "HD";
  if (profile === "lowes") return "LOW";

  const lower = text.toLowerCase();
  if (
    /\blow(?:e'?s|es)?\b/.test(lower) &&
    !/\bhome\s*depot\b|\bhd\b/.test(lower)
  ) {
    return "LOW";
  }
  if (/\bhome\s*depot\b|\bhd\b/.test(lower)) return "HD";
  return "HD";
}

export function parseMassUploadRequest(
  text: string,
  profile: BotProfile = "full",
): MassUploadRequest {
  const lower = text.toLowerCase();

  let region = "N.CA";
  if (/\bn\.?\s*ca\b|\bnor(?:th)?\s*cal(?:ifornia)?\b|\bncal\b/.test(lower)) {
    region = "N.CA";
  } else if (/\bs\.?\s*ca\b|\bsouth\s*cal(?:ifornia)?\b|\bscal\b/.test(lower)) {
    region = "S.CA";
  }

  const channel = channelForProfile(profile, text);

  // Dates: 9-30-2026, 9/30/2026, 2026-09-30
  let reqDeliveryDate: Date | null = null;
  const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const us = lower.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (iso) {
    reqDeliveryDate = new Date(
      Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12, 0, 0),
    );
  } else if (us) {
    reqDeliveryDate = new Date(
      Date.UTC(+us[3], +us[1] - 1, +us[2], 12, 0, 0),
    );
  }

  let orderType = "";
  const ot = text.match(/order\s*type\s*[:=]?\s*["']?([^"'\n,]+)/i);
  if (ot) orderType = ot[1].trim();
  if (!orderType && region === "N.CA" && channel === "HD") {
    orderType = "WIN NORTH CA";
  }
  if (!orderType && region === "N.CA" && channel === "LOW") {
    orderType = "PIR NORTH CA";
  }

  const regionLabel = region.replace(".", "");
  const shipInstr = `${regionLabel} SPREAD (WCRO)`;

  return { region, channel, reqDeliveryDate, orderType, shipInstr };
}

function formatDateYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function repoRootFromBot(): string {
  // dist/everde/massUpload.js → teams-claude-bot → repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

async function runPythonBuild(req: MassUploadRequest): Promise<Buffer | null> {
  const root = repoRootFromBot();
  const script = path.join(root, "scripts", "wcro", "build_mass_upload.py");
  try {
    await fs.access(script);
  } catch {
    logger.info("massUpload.python_script_missing", { script });
    return null;
  }

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "everde-mass-upload-"));
  const outFile = path.join(
    outDir,
    `${req.channel}_${req.region.replace(".", "")}_MassUpload.xlsm`,
  );

  const args = [
    script,
    "--region",
    req.region,
    "--channel",
    req.channel,
    "--output",
    outFile,
    "--ship-instr",
    req.shipInstr,
  ];
  if (req.orderType) args.push("--order-type", req.orderType);
  if (req.reqDeliveryDate) {
    args.push("--req-delivery-date", formatDateYmd(req.reqDeliveryDate));
  }
  if (req.channel === "HD") {
    args.push("--customer", "HOME DEPOT CORP - VN");
  } else {
    args.push("--customer", "LOWE''S COMPANIES, INC. - VN");
  }

  const pythonCandidates = [
    process.env.MASS_UPLOAD_PYTHON?.trim(),
    "python",
    "python3",
    "py",
  ].filter(Boolean) as string[];

  for (const py of pythonCandidates) {
    try {
      const code = await spawnCapture(py, args, root);
      if (code === 0) {
        const buf = await fs.readFile(outFile);
        logger.info("massUpload.python_ok", {
          bytes: buf.length,
          outFile,
          py,
        });
        return buf;
      }
    } catch (err) {
      logger.warn("massUpload.python_attempt_failed", {
        py,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

function spawnCapture(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      env: process.env,
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && stderr) {
        logger.warn("massUpload.python_stderr", {
          code,
          stderr: stderr.slice(0, 1500),
        });
      }
      resolve(code ?? 1);
    });
  });
}

async function fetchLatestFromBlob(
  req: MassUploadRequest,
): Promise<Buffer | null> {
  const container = freightBlobContainer();
  const blobPath = massUploadLatestBlobPath(req.channel, req.region);
  const buf = await downloadBytesFromBlob(container, blobPath);
  if (!buf) {
    logger.warn("massUpload.blob_miss", { container, blobPath });
    return null;
  }
  logger.info("massUpload.blob_hit", { blobPath, bytes: buf.length });
  return buf;
}

export async function buildMassUploadWorkbook(
  req: MassUploadRequest,
): Promise<{
  buffer: Buffer;
  fileName: string;
  source: "python" | "blob";
}> {
  const datePart = req.reqDeliveryDate
    ? formatDateYmd(req.reqDeliveryDate).replace(/-/g, "")
    : "NODATE";
  const fileName = `${req.channel}_${req.region.replace(".", "")}_MassUpload_${datePart}.xlsm`;

  // Prefer live Python build when UNC + openpyxl are available (VPN / local).
  const live = await runPythonBuild(req);
  if (live) {
    // Best-effort publish for App Service fallback
    void uploadBytesToBlob(
      freightBlobContainer(),
      massUploadLatestBlobPath(req.channel, req.region),
      live,
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    ).catch((err) =>
      logger.warn("massUpload.blob_publish_failed", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return { buffer: live, fileName, source: "python" };
  }

  const fromBlob = await fetchLatestFromBlob(req);
  if (fromBlob) {
    return { buffer: fromBlob, fileName, source: "blob" };
  }

  throw new Error(
    "Mass upload workbook is not available yet (Python build failed and no Blob fallback). Publish via scripts/wcro/publish_mass_upload_blob.py first.",
  );
}

export function massUploadDeniedMessage(): string {
  return "Mass upload generation is in limited testing and is not enabled for your account yet.";
}

export function massUploadDescription(req: MassUploadRequest, source: string): string {
  const dateLabel = req.reqDeliveryDate
    ? formatDateYmd(req.reqDeliveryDate)
    : "(set B2 before Oracle upload)";
  return (
    `Oracle Mass Upload — ${req.channel} ${req.region} | ship ${dateLabel}` +
    (req.orderType ? ` | ${req.orderType}` : "") +
    ` | source=${source}. Citrus + non-region xref items excluded from this file only` +
    ` (not from WCRO). Fill any blank B2/B4 before Upload To Oracle.`
  );
}
