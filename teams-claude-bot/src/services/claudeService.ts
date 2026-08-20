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
import {
  BOT_PROFILES,
  buildBotProfilePromptBlock,
  type BotProfile,
} from "../everde/botProfile.js";
import { buildEverdeSnapshot } from "../everde/snapshot.js";
import {
  executeEverdeTool,
  toolsForProfile,
} from "../everde/tools.js";
import {
  buildViewRightsPromptBlock,
  capabilitiesForEmail,
} from "../everde/viewRights.js";
import { buildRetailFiscalWeekPromptBlock } from "../everde/retailFiscalWeeks.js";
import { logger } from "../utils/logger.js";
import type { StoredTurn } from "./conversationStore.js";
import { shouldEnableWebSearch } from "./webSearchDetect.js";

const MAX_TOOL_ROUNDS = 6;

export type ClaudeCompleteOptions = {
  userEmail?: string | null;
  profile?: BotProfile;
};

export type ClaudeCompleteResult = {
  text: string;
  toolCalls: { name: string; input: unknown; result: string }[];
};

export class ClaudeService {
  private readonly client: Anthropic;
  private readonly config: AppConfig;
  private everdeSnapshotCache: Map<
    string,
    { at: number; block: string; ytdAsOfDates: string[] }
  > = new Map();

  constructor(config?: AppConfig) {
    this.config = config ?? getConfig();
    this.client = new Anthropic({ apiKey: this.config.ANTHROPIC_API_KEY });
  }

  async complete(
    history: StoredTurn[],
    userMessage: string,
    userTextForRouting?: string,
    options?: ClaudeCompleteOptions,
  ): Promise<ClaudeCompleteResult> {
    return this.completeWithContent(
      history,
      userMessage,
      userTextForRouting ?? userMessage,
      options,
    );
  }

  async completeWithContent(
    history: StoredTurn[],
    userContent: string | ContentBlockParam[],
    userTextForRouting = "",
    options?: ClaudeCompleteOptions,
  ): Promise<ClaudeCompleteResult> {
    const routingText =
      userTextForRouting.trim() ||
      (typeof userContent === "string" ? userContent : "");

    const userEmail = options?.userEmail ?? null;
    const profile = options?.profile ?? "full";
    const profileCaps = BOT_PROFILES[profile];
    const viewCaps = capabilitiesForEmail(userEmail);
    const allowLowes =
      profileCaps.datasets.lowesYtd &&
      (profile !== "full" || viewCaps.lowesYtd);
    const allowHd =
      profileCaps.datasets.hdYtd && (profile !== "full" || viewCaps.hdYtd);
    // Field bots keep nursery; Claude (full) honors retailer-slice caps.
    const allowFreight =
      profileCaps.datasets.freight &&
      (profile !== "full" || viewCaps.freight);
    const allowWeather =
      profileCaps.datasets.weather &&
      (profile !== "full" || viewCaps.weather);
    const allowFarm =
      (profileCaps.datasets.nurserySupply ||
        profileCaps.datasets.nurseryDemand) &&
      (profile !== "full" || viewCaps.farmInventory);
    const allowSalesPlan =
      profileCaps.datasets.salesPlan &&
      (profile !== "full" || viewCaps.salesPlanOps);
    const allowSalesByItem =
      Boolean(profileCaps.datasets.salesByItem) &&
      (profile !== "full" ||
        viewCaps.salesPlanOps ||
        viewCaps.hdYtd ||
        viewCaps.lowesYtd);
    const allowRetail =
      profileCaps.datasets.retail &&
      (profile !== "full" || viewCaps.hdYtd || viewCaps.lowesYtd);
    const allowWcro =
      profileCaps.datasets.wcro &&
      (profile !== "full" || viewCaps.hdYtd || viewCaps.lowesYtd);

    const { block: everdeBlock, ytdAsOfDates } =
      await this.getEverdeSnapshotBlock(profile, {
        allowLowes,
        allowHd,
        allowFreight,
        allowWeather,
        allowFarm,
        allowSalesPlan,
        allowSalesByItem,
        allowRetail,
        allowWcro,
      });
    const identityBlock = buildBotProfilePromptBlock(profile);
    const rightsBlock = buildViewRightsPromptBlock(userEmail);
    const fiscalBlock = buildRetailFiscalWeekPromptBlock({ ytdAsOfDates });
    const baseSystem =
      this.config.CLAUDE_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
    const system = [
      baseSystem,
      identityBlock,
      rightsBlock,
      fiscalBlock,
      everdeBlock,
    ]
      .filter(Boolean)
      .join("\n\n");

    const messages: MessageParam[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    const webSearchEnabled =
      profileCaps.enableWebSearch &&
      this.config.ENABLE_WEB_SEARCH &&
      shouldEnableWebSearch(routingText);
    const tools = this.buildTools(
      webSearchEnabled,
      profile,
      userEmail,
    );
    const hasDocuments = Array.isArray(userContent);
    const toolCalls: ClaudeCompleteResult["toolCalls"] = [];

    logger.info("claude.request", {
      model: this.config.CLAUDE_MODEL,
      profile,
      messageCount: messages.length,
      hasAttachments: hasDocuments,
      everdeTools: tools.filter((t) => t.name !== "web_search").length,
      webSearch: webSearchEnabled,
      viewRole: viewCaps.role,
      allowHd,
      allowLowes,
      userEmail: userEmail?.toLowerCase() ?? null,
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
            const result = await executeEverdeTool(block.name, block.input, {
              userEmail,
              profile,
            });
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
            logger.info("everde.tool", {
              name: block.name,
              profile,
              bytes: result.length,
            });
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
      logger.error("claude.error", { err, profile });
      throw err;
    }
  }

  private buildTools(
    webSearchEnabled: boolean,
    profile: BotProfile,
    userEmail: string | null,
  ): Tool[] {
    const out: Tool[] = toolsForProfile(profile, userEmail);

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

  private async getEverdeSnapshotBlock(
    profile: BotProfile,
    flags: {
      allowLowes: boolean;
      allowHd: boolean;
      allowFreight: boolean;
      allowWeather: boolean;
      allowFarm: boolean;
      allowSalesPlan: boolean;
      allowSalesByItem: boolean;
      allowRetail: boolean;
      allowWcro: boolean;
    },
  ): Promise<{ block: string; ytdAsOfDates: string[] }> {
    const ttlMs = this.config.EVERDE_SNAPSHOT_CACHE_MS;
    const now = Date.now();
    const key = `${profile}:hd${flags.allowHd ? 1 : 0}:lo${flags.allowLowes ? 1 : 0}:f${flags.allowFreight ? 1 : 0}:w${flags.allowWeather ? 1 : 0}:n${flags.allowFarm ? 1 : 0}:wcro${flags.allowWcro ? 1 : 0}:sbi${flags.allowSalesByItem ? 1 : 0}`;
    const cached = this.everdeSnapshotCache.get(key);
    if (cached && now - cached.at < ttlMs) {
      return { block: cached.block, ytdAsOfDates: cached.ytdAsOfDates };
    }

    const snap = await buildEverdeSnapshot({ profile, ...flags });
    this.everdeSnapshotCache.set(key, {
      at: now,
      block: snap.systemBlock,
      ytdAsOfDates: snap.ytdAsOfDates,
    });
    return { block: snap.systemBlock, ytdAsOfDates: snap.ytdAsOfDates };
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
