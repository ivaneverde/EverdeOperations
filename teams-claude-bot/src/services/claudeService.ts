import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
  WebSearchTool20250305,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import {
  DEFAULT_SYSTEM_PROMPT,
  getConfig,
  type AppConfig,
} from "../config/index.js";
import { buildEverdeSnapshot } from "../everde/snapshot.js";
import {
  EVERDE_TOOL_DEFINITIONS,
  executeEverdeTool,
} from "../everde/tools.js";
import { logger } from "../utils/logger.js";
import type { StoredTurn } from "./conversationStore.js";
import { shouldEnableWebSearch } from "./webSearchDetect.js";

const MAX_TOOL_ROUNDS = 6;

export type ClaudeCompleteResult = {
  text: string;
  toolCalls: { name: string; input: unknown; result: string }[];
};

export class ClaudeService {
  private readonly client: Anthropic;
  private readonly config: AppConfig;
  private everdeSnapshotCache: { at: number; block: string } | null = null;

  constructor(config?: AppConfig) {
    this.config = config ?? getConfig();
    this.client = new Anthropic({ apiKey: this.config.ANTHROPIC_API_KEY });
  }

  async complete(
    history: StoredTurn[],
    userMessage: string,
    userTextForRouting?: string,
  ): Promise<ClaudeCompleteResult> {
    return this.completeWithContent(
      history,
      userMessage,
      userTextForRouting ?? userMessage,
    );
  }

  async completeWithContent(
    history: StoredTurn[],
    userContent: string | ContentBlockParam[],
    userTextForRouting = "",
  ): Promise<ClaudeCompleteResult> {
    const routingText =
      userTextForRouting.trim() ||
      (typeof userContent === "string" ? userContent : "");

    const everdeBlock = await this.getEverdeSnapshotBlock();
    const baseSystem =
      this.config.CLAUDE_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
    const system = `${baseSystem}\n\n${everdeBlock}`;

    const messages: MessageParam[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    const webSearchEnabled =
      this.config.ENABLE_WEB_SEARCH && shouldEnableWebSearch(routingText);
    const tools = this.buildTools(routingText, webSearchEnabled);
    const hasDocuments = Array.isArray(userContent);
    const toolCalls: ClaudeCompleteResult["toolCalls"] = [];

    logger.info("claude.request", {
      model: this.config.CLAUDE_MODEL,
      messageCount: messages.length,
      hasAttachments: hasDocuments,
      everdeTools: EVERDE_TOOL_DEFINITIONS.length,
      webSearch: webSearchEnabled,
    });

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.client.messages.create({
          model: this.config.CLAUDE_MODEL,
          max_tokens: this.config.CLAUDE_MAX_TOKENS,
          system,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        if (
          response.stop_reason === "end_turn" ||
          response.stop_reason === "max_tokens"
        ) {
          return {
            text: this.extractText(response.content),
            toolCalls,
          };
        }

        if (response.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: response.content });
          continue;
        }

        if (response.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: response.content });

          const toolResults: ContentBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            const result = await executeEverdeTool(block.name, block.input);
            toolCalls.push({
              name: block.name,
              input: block.input,
              result,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
            logger.info("everde.tool", { name: block.name, bytes: result.length });
          }

          if (toolResults.length === 0) {
            return {
              text: this.extractText(response.content),
              toolCalls,
            };
          }

          messages.push({ role: "user", content: toolResults });
          continue;
        }

        return {
          text: this.extractText(response.content),
          toolCalls,
        };
      }

      throw new Error("Claude exceeded maximum tool rounds");
    } catch (err) {
      logger.error("claude.error", { err });
      throw err;
    }
  }

  private buildTools(userText: string, webSearchEnabled: boolean): Tool[] {
    const out: Tool[] = [...EVERDE_TOOL_DEFINITIONS];

    if (webSearchEnabled) {
      const webTool: WebSearchTool20250305 = {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: this.config.WEB_SEARCH_MAX_USES,
      };
      out.push(webTool as unknown as Tool);
    }

    return out;
  }

  private async getEverdeSnapshotBlock(): Promise<string> {
    const ttlMs = this.config.EVERDE_SNAPSHOT_CACHE_MS;
    const now = Date.now();
    if (
      this.everdeSnapshotCache &&
      now - this.everdeSnapshotCache.at < ttlMs
    ) {
      return this.everdeSnapshotCache.block;
    }

    const snap = await buildEverdeSnapshot();
    this.everdeSnapshotCache = { at: now, block: snap.systemBlock };
    return snap.systemBlock;
  }

  private extractText(
    content: Anthropic.Messages.ContentBlock[],
  ): string {
    const parts = content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""));
    const text = parts.join("\n").trim();
    if (!text) {
      throw new Error("Claude returned no text content");
    }
    return text;
  }
}
