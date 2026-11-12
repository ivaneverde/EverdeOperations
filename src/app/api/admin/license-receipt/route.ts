import { NextResponse } from "next/server";
import { requireAdminUploadAuth } from "@/lib/auth/requireAdminUploadAuth";
import { getBlobServiceClient } from "@/lib/azure/blobClient";
import {
  periodForDate,
  publishPreeminentLicenseStatus,
  type PreeminentLicenseStatus,
} from "@/lib/license/preeminentLicense";

export const dynamic = "force-dynamic";

const PERIOD_RE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}$/i;

/**
 * Multipart: file = receipt; optional period=NOV2026 (else inferred from filename or current month).
 * Marks the period paid and re-enables services in Blob license/preeminent_status.json.
 */
export async function POST(request: Request) {
  const auth = await requireAdminUploadAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const svc = getBlobServiceClient();
  if (!svc) {
    return NextResponse.json(
      { error: "AZURE_STORAGE_CONNECTION_STRING is not set." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, {
      status: 400,
    });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file field (multipart name: file)." },
      { status: 400 },
    );
  }

  const periodField = String(form.get("period") || "").trim().toUpperCase();
  const nameUpper = file.name.toUpperCase();
  const fromName = nameUpper.match(
    /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}/,
  );
  const period =
    periodField ||
    (fromName ? fromName[0] : "") ||
    periodForDate();

  if (!PERIOD_RE.test(period)) {
    return NextResponse.json(
      {
        error:
          "Invalid period. Use MMMYYYY (e.g. DEC2026) in the period field or filename.",
      },
      { status: 400 },
    );
  }

  // Filename must reference Preeminent and the exact invoice month (no other period).
  if (!/PREEMINENT/i.test(file.name)) {
    return NextResponse.json(
      {
        error:
          "Filename must include Preeminent (only The PreEminent Store LLC receipts are accepted).",
      },
      { status: 400 },
    );
  }
  if (!nameUpper.includes(period)) {
    return NextResponse.json(
      {
        error: `Filename must include invoice period ${period} (exact month only).`,
      },
      { status: 400 },
    );
  }
  const otherPeriod = nameUpper.match(
    /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}/g,
  );
  if (otherPeriod && otherPeriod.some((p) => p !== period)) {
    return NextResponse.json(
      {
        error: `Filename has mismatched invoice period; expected only ${period}.`,
      },
      { status: 400 },
    );
  }

  const container =
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() || "everde-freight";
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const blobPath = `license/receipts/${period}/${Date.now()}-${safeName}`;
  const client = svc.getContainerClient(container).getBlockBlobClient(blobPath);
  const buf = Buffer.from(await file.arrayBuffer());
  await client.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: file.type || "application/octet-stream",
    },
  });

  const status: PreeminentLicenseStatus = {
    vendor: "The PreEminent Store LLC",
    product: "OPENAI Vercel Repository Libraries Plus",
    period,
    paid: true,
    proof: {
      source: "upload",
      name: file.name,
      path: `${container}/${blobPath}`,
      modified: new Date().toISOString(),
      invoice: period,
      merchant: "The PreEminent Store LLC",
    },
    services_enabled: true,
    enable_reason: "proof_on_file",
    checked_at: new Date().toISOString(),
    policy: {
      grace:
        "Pay ~5th is fine. Services stay on through month-end; disable only after the month ends with no receipt.",
      proof:
        "Only The PreEminent Store LLC PayPal receipts for the exact invoice MMMYYYY (e.g. DEC2026).",
    },
  };

  await publishPreeminentLicenseStatus(status);

  return NextResponse.json({
    ok: true,
    authVia: auth.via,
    period,
    container,
    blobPath,
    status,
  });
}
