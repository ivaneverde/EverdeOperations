import { truncateForContext } from "@/lib/assistant/truncateForContext";

/** Prefer summary-like top-level keys; keep full payload only when small. */
const PRIORITY_KEY_PATTERNS = [
  /^meta$/i,
  /kpi/i,
  /summary/i,
  /company/i,
  /carrier/i,
  /region/i,
  /ytd/i,
  /exec/i,
  /totals?/i,
  /overview/i,
  /channel/i,
  /plan/i,
  /inventory/i,
];

function pickPriorityKeys(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (PRIORITY_KEY_PATTERNS.some((re) => re.test(key))) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Shrink dashboard JSON for LLM context (token budget).
 * Falls back to truncation if parsing fails or excerpt is still too large.
 */
export function compactJsonForAssistant(
  raw: string,
  maxChars: number,
): string {
  if (raw.length <= maxChars) return raw;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const priority = pickPriorityKeys(obj);
      const priorityJson = JSON.stringify(
        Object.keys(priority).length > 0 ? priority : obj,
      );
      if (priorityJson.length <= maxChars) return priorityJson;

      const minimal = JSON.stringify({
        meta: obj.meta ?? null,
        _note:
          "Large dashboard JSON compacted for assistant context. Answer from these summaries; say if detail is missing.",
        ...priority,
      });
      if (minimal.length <= maxChars) return minimal;
    }
  } catch {
    /* use truncate below */
  }

  return truncateForContext(raw, maxChars);
}
