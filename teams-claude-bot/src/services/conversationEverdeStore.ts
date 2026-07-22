import { getConfig } from "../config/index.js";

/** Compact Everde tool result retained for multi-turn Teams discussion. */
export type CachedEverdeToolResult = {
  toolName: string;
  inputSummary: string;
  resultExcerpt: string;
  at: number;
};

const MAX_RESULTS_PER_CHAT = 8;
const MAX_CHARS_PER_RESULT = 6_000;

function maxTotalChars(): number {
  // Reuse file total budget scale; keep Everde working set modest.
  return Math.min(getConfig().CONVERSATION_FILE_MAX_TOTAL_CHARS, 120_000);
}

function summarizeInput(input: unknown): string {
  if (input == null) return "";
  try {
    const s = JSON.stringify(input);
    return s.length > 240 ? `${s.slice(0, 240)}…` : s;
  } catch {
    return String(input).slice(0, 240);
  }
}

/**
 * Retains recent Everde tool results per Teams conversation so follow-ups
 * can discuss freight / sales plan / HD·Lowe's YTD without re-stating filters.
 */
export class ConversationEverdeStore {
  private readonly byChat = new Map<string, CachedEverdeToolResult[]>();

  get(conversationId: string): CachedEverdeToolResult[] {
    return this.byChat.get(conversationId) ?? [];
  }

  add(
    conversationId: string,
    toolName: string,
    input: unknown,
    result: string,
  ): void {
    const excerpt = result.slice(0, MAX_CHARS_PER_RESULT);
    const next = [
      ...this.get(conversationId),
      {
        toolName,
        inputSummary: summarizeInput(input),
        resultExcerpt: excerpt,
        at: Date.now(),
      },
    ].slice(-MAX_RESULTS_PER_CHAT);

    const limit = maxTotalChars();
    let total = next.reduce((s, r) => s + r.resultExcerpt.length, 0);
    while (total > limit && next.length > 1) {
      next.shift();
      total = next.reduce((s, r) => s + r.resultExcerpt.length, 0);
    }

    this.byChat.set(conversationId, next);
  }

  clear(conversationId: string): void {
    this.byChat.delete(conversationId);
  }

  /** Injected before the user's follow-up so Claude can continue the discussion. */
  buildFollowUpContext(conversationId: string): string | null {
    const items = this.get(conversationId);
    if (items.length === 0) return null;

    const parts = items.map((r, i) => {
      const input = r.inputSummary ? ` input=${r.inputSummary}` : "";
      return `### Prior tool ${i + 1}: ${r.toolName}${input}\n${r.resultExcerpt}`;
    });

    return [
      "## Prior Everde tool results in this Teams chat",
      "The user is continuing a discussion. Use these prior tool results for follow-ups — do **not** ask them to repeat store names, SKUs, filters, or earlier numbers.",
      "Re-call Everde tools only when they ask for a different filter, retailer, or fresher/deeper sample than what is already below.",
      "",
      parts.join("\n\n"),
    ].join("\n");
  }
}
