import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  DEFAULT_SYSTEM_PROMPT,
  getConfig,
  type AppConfig,
} from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { StoredTurn } from "./conversationStore.js";

export class ClaudeService {
  private readonly client: Anthropic;
  private readonly config: AppConfig;

  constructor(config?: AppConfig) {
    this.config = config ?? getConfig();
    this.client = new Anthropic({ apiKey: this.config.ANTHROPIC_API_KEY });
  }

  async complete(history: StoredTurn[], userMessage: string): Promise<string> {
    return this.completeWithContent(history, userMessage);
  }

  async completeWithContent(
    history: StoredTurn[],
    userContent: string | ContentBlockParam[],
  ): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    const system =
      this.config.CLAUDE_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;

    const hasDocuments = Array.isArray(userContent);

    logger.info("claude.request", {
      model: this.config.CLAUDE_MODEL,
      messageCount: messages.length,
      hasAttachments: hasDocuments,
    });

    try {
      const response = await this.client.messages.create({
        model: this.config.CLAUDE_MODEL,
        max_tokens: this.config.CLAUDE_MAX_TOKENS,
        system,
        messages,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text content");
      }

      return textBlock.text.trim();
    } catch (err) {
      logger.error("claude.error", { err });
      throw err;
    }
  }
}
