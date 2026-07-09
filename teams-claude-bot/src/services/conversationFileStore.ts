/**
 * Retains extracted file text per Teams conversation so follow-up questions
 * can reference uploads without re-downloading from Graph.
 */
export type CachedConversationFile = {
  fileName: string;
  extractedText: string;
  uploadedAt: number;
};

const MAX_FILES_PER_CHAT = 5;
const MAX_CHARS_PER_FILE = 120_000;
const MAX_TOTAL_CHARS = 200_000;

export class ConversationFileStore {
  private readonly files = new Map<string, CachedConversationFile[]>();

  get(conversationId: string): CachedConversationFile[] {
    return this.files.get(conversationId) ?? [];
  }

  add(conversationId: string, fileName: string, extractedText: string): void {
    const trimmed = extractedText.slice(0, MAX_CHARS_PER_FILE);
    const existing = this.get(conversationId).filter((f) => f.fileName !== fileName);
    const next: CachedConversationFile[] = [
      ...existing,
      { fileName, extractedText: trimmed, uploadedAt: Date.now() },
    ].slice(-MAX_FILES_PER_CHAT);

    let total = next.reduce((s, f) => s + f.extractedText.length, 0);
    while (total > MAX_TOTAL_CHARS && next.length > 1) {
      next.shift();
      total = next.reduce((s, f) => s + f.extractedText.length, 0);
    }

    this.files.set(conversationId, next);
  }

  clear(conversationId: string): void {
    this.files.delete(conversationId);
  }

  /** Plain-text block for follow-up turns (injected before the user's question). */
  buildFollowUpContext(conversationId: string): string | null {
    const files = this.get(conversationId);
    if (files.length === 0) return null;

    const parts = files.map(
      (f) =>
        `### ${f.fileName} (uploaded earlier in this chat)\n${f.extractedText}`,
    );
    return [
      "The user uploaded the following file(s) earlier in this Teams chat. Use this data for follow-up questions — do not ask them to re-upload unless they switch to a different file.",
      "",
      parts.join("\n\n"),
    ].join("\n");
  }
}
