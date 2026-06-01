import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import * as XLSX from "xlsx";
import { getConfig } from "../config/index.js";
import type { DownloadedFile } from "./teamsAttachmentDownloader.js";

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const TEXT_LIKE_EXT = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "log",
  "xml",
  "yaml",
  "yml",
  "ts",
  "js",
  "py",
]);

export interface BuildContentResult {
  blocks: ContentBlockParam[];
  summaryForHistory: string;
}

function extension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

function excelToText(buffer: Buffer, fileName: string): string {
  const maxRows = getConfig().ATTACHMENT_MAX_EXCEL_ROWS;
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const parts: string[] = [];

  for (const sheetName of wb.SheetNames.slice(0, 3)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      { header: 1, defval: "" },
    ) as (string | number | boolean | null)[][];
    const clipped = rows.slice(0, maxRows);
    const csv = clipped
      .map((row) =>
        row.map((c) => String(c ?? "").replace(/\t/g, " ")).join("\t"),
      )
      .join("\n");
    parts.push(`### Sheet: ${sheetName}\n${csv}`);
    if (rows.length > maxRows) {
      parts.push(`(…${rows.length - maxRows} more rows not shown)`);
    }
  }

  return `Spreadsheet "${fileName}" (tabular extract for analysis):\n\n${parts.join("\n\n")}`;
}

/**
 * Convert downloaded Teams files into Claude message content blocks.
 */
export function buildClaudeContentFromFiles(
  files: DownloadedFile[],
  userPrompt: string,
): BuildContentResult {
  const blocks: ContentBlockParam[] = [];
  const historyParts: string[] = [];

  for (const file of files) {
    const ext = extension(file.fileName);
    const mime = file.contentType.toLowerCase();

    if (mime === "application/pdf" || ext === "pdf") {
      blocks.push({
        type: "document",
        title: file.fileName,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: file.buffer.toString("base64"),
        },
      });
      historyParts.push(`[PDF: ${file.fileName}]`);
      continue;
    }

    if (IMAGE_MIME.has(mime) || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      const mediaType =
        mime.startsWith("image/") && IMAGE_MIME.has(mime)
          ? (mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
          : ext === "png"
            ? "image/png"
            : ext === "gif"
              ? "image/gif"
              : ext === "webp"
                ? "image/webp"
                : "image/jpeg";

      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: file.buffer.toString("base64"),
        },
      });
      historyParts.push(`[Image: ${file.fileName}]`);
      continue;
    }

    if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
      const text = excelToText(file.buffer, file.fileName);
      blocks.push({
        type: "document",
        title: file.fileName,
        source: {
          type: "text",
          media_type: "text/plain",
          data: text,
        },
      });
      historyParts.push(`[Excel: ${file.fileName}]`);
      continue;
    }

    if (ext === "xlsb") {
      throw new Error(
        `Binary Excel (.xlsb) "${file.fileName}" is not supported in Teams chat. Save as .xlsx or export to PDF/CSV and re-attach.`,
      );
    }

    if (
      mime.startsWith("text/") ||
      TEXT_LIKE_EXT.has(ext) ||
      ext === "csv"
    ) {
      const text = file.buffer.toString("utf8");
      blocks.push({
        type: "document",
        title: file.fileName,
        source: {
          type: "text",
          media_type: "text/plain",
          data: `File "${file.fileName}":\n\n${text}`,
        },
      });
      historyParts.push(`[File: ${file.fileName}]`);
      continue;
    }

    if (ext === "docx" || ext === "pptx") {
      throw new Error(
        `"${file.fileName}" — Office files are not read directly. Export to PDF or attach .xlsx / .csv for analytics.`,
      );
    }

    throw new Error(
      `Unsupported file type: "${file.fileName}" (${mime || ext || "unknown"}). Use PDF, images, Excel (.xlsx), or text/CSV.`,
    );
  }

  const prompt =
    userPrompt.trim() ||
    (files.length === 1
      ? `Analyze the attached file "${files[0].fileName}". Summarize key points, answer likely executive questions, and call out metrics or risks when present.`
      : "Analyze the attached files. Summarize, compare if relevant, and highlight actionable insights.");

  blocks.push({ type: "text", text: prompt });

  const summaryForHistory = [
    historyParts.join(" "),
    userPrompt.trim() || "(file analysis request)",
  ]
    .filter(Boolean)
    .join(" — ");

  return { blocks, summaryForHistory };
}
