import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";

export type StoredTurn = Pick<MessageParam, "role" | "content">;

/**
 * In-memory conversation history keyed by Teams conversation ID.
 * For production at scale, swap for Redis / Cosmos DB (see README).
 */
export class ConversationStore {
  private readonly histories = new Map<string, StoredTurn[]>();

  constructor(private readonly maxTurns: number) {}

  get(conversationId: string): StoredTurn[] {
    return this.histories.get(conversationId) ?? [];
  }

  append(conversationId: string, turn: StoredTurn): StoredTurn[] {
    const next = [...this.get(conversationId), turn];
    const trimmed = next.slice(-this.maxTurns * 2);
    this.histories.set(conversationId, trimmed);
    return trimmed;
  }

  clear(conversationId: string): void {
    this.histories.delete(conversationId);
  }
}
