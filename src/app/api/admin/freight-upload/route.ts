import { NextResponse } from "next/server";
import { requireAdminUploadAuth } from "@/lib/auth/requireAdminUploadAuth";
import { uploadFreightIncomingFile } from "@/lib/azure/freightDashboardBlob";

export const dynamic = "force-dynamic";

/** Max upload size (bytes). Override with EVERDE_FREIGHT_UPLOAD_MAX_BYTES */
const DEFAULT_MAX = 80 * 1024 * 1024;

/**
 * Multipart upload: field `file` = .xlsb / .xlsx weekly drop → Azure Blob incoming/…
 * Auth: Entra Bearer (same tenant + @everde.com) or x-everde-admin-key when configured.
 */
export async function POST(request: Request) {
  const auth = await requireAdminUploadAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status },
    );
  }

  const maxBytes =
    Number(process.env.EVERDE_FREIGHT_UPLOAD_MAX_BYTES?.trim()) ||
    DEFAULT_MAX;

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

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsb") && !lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    return NextResponse.json(
      { error: "Only .xlsb, .xlsx, or .xlsm uploads are accepted." },
      { status: 400 },
    );
  }

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large (max ${maxBytes} bytes).` },
      { status: 413 },
    );
  }

  try {
    const { container, blobPath } = await uploadFreightIncomingFile(file);
    return NextResponse.json({
      ok: true,
      authVia: auth.via,
      container,
      blobPath,
      hint:
        "Run scripts/freight/claude-handoff/extract_data.py on this file, then npm run publish:freight-json (or upload dashboard_data.json to Blob freight/latest/).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
