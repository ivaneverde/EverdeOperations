import {
  ActivityHandler,
  ActivityTypes,
  MessageFactory,
  TurnContext,
} from "botbuilder";
import { getConfig } from "../config/index.js";
import { buildClaudeContentFromFiles } from "../services/claudeContentBuilder.js";
import { ClaudeService } from "../services/claudeService.js";
import { ConversationStore } from "../services/conversationStore.js";
import { ConversationFileStore } from "../services/conversationFileStore.js";
import { ConversationEverdeStore } from "../services/conversationEverdeStore.js";
import {
  activityHasUserFileAttachment,
  downloadAllMessageAttachments,
  shouldAttemptFileDownload,
  summarizeAttachments,
} from "../services/teamsAttachmentDownloader.js";
import { GraphFileAccessError } from "../graph/chatMessageFiles.js";
import { handleFileConsentInvoke } from "./fileConsentHandler.js";
import { logger } from "../utils/logger.js";
import {
  GRAPH_PERMISSION_HELP,
  isPersonalBotChat,
} from "../utils/teamsConversationScope.js";
import { getTeamsMessageText } from "../utils/teamsMessageText.js";
import { resolveTeamsUserEmail } from "../everde/resolveTeamsUserEmail.js";
import {
  BOT_PROFILES,
  helpTextForProfile,
  type BotProfile,
} from "../everde/botProfile.js";
import {
  botProfileDeniedMessage,
  canAccessBotProfile,
} from "../everde/viewRights.js";

export class TeamsClaudeBot extends ActivityHandler {
  private readonly claude: ClaudeService;
  private readonly store: ConversationStore;
  private readonly fileStore: ConversationFileStore;
  private readonly everdeStore: ConversationEverdeStore;
  private readonly profile: BotProfile;
  private readonly helpText: string;

  constructor(profile: BotProfile = "full") {
    super();
    const config = getConfig();
    this.profile = profile;
    this.helpText = helpTextForProfile(profile);
    this.claude = new ClaudeService(config);
    this.store = new ConversationStore(config.CONVERSATION_MAX_TURNS);
    this.fileStore = new ConversationFileStore();
    this.everdeStore = new ConversationEverdeStore();

    const display = BOT_PROFILES[profile].displayName;

    this.onMembersAdded(async (context, next) => {
      const members = context.activity.membersAdded ?? [];
      for (const member of members) {
        if (member.id !== context.activity.recipient?.id) {
          await context.sendActivity(
            MessageFactory.text(
              `Hello — I am **${display}**. Ask questions, or **attach a file** (PDF, Excel, image) for analysis. Type \`/help\` for details.`,
            ),
          );
        }
      }
      await next();
    });

    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });
  }

  override async run(context: TurnContext): Promise<void> {
    if (context.activity.type === ActivityTypes.Invoke) {
      const handled = await handleFileConsentInvoke(context);
      if (handled) return;
    }
    await super.run(context);
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    const text = getTeamsMessageText(context.activity);
    const attachments = context.activity.attachments ?? [];
    const tryFileDownload = shouldAttemptFileDownload(context, attachments, text);
    const personalChat = isPersonalBotChat(context);

    logger.info("bot.message", {
      profile: this.profile,
      conversationType: context.activity.conversation?.conversationType,
      personalChat,
      textLen: text.length,
      attachmentCount: attachments.length,
      tryFileDownload,
      attachments: summarizeAttachments(attachments),
    });

    if (!text && !tryFileDownload) {
      await context.sendActivity(
        "Send a message, or attach a file (PDF, Excel, image) with your question.",
      );
      return;
    }

    const conversationId =
      context.activity.conversation?.id ?? context.activity.from?.id ?? "default";

    const command = text.toLowerCase();

    if (command === "/help" || command === "help") {
      await context.sendActivity(MessageFactory.text(this.helpText));
      return;
    }

    if (command === "/reset" || command === "reset") {
      this.store.clear(conversationId);
      this.fileStore.clear(conversationId);
      this.everdeStore.clear(conversationId);
      await context.sendActivity("Conversation history cleared for this chat.");
      return;
    }

    await context.sendActivity({ type: ActivityTypes.Typing });

    const userEmail = await resolveTeamsUserEmail(context);

    if (!canAccessBotProfile(userEmail, this.profile)) {
      logger.info("bot.profile.denied", {
        profile: this.profile,
        userEmail: userEmail?.toLowerCase() ?? null,
      });
      await context.sendActivity(
        MessageFactory.text(botProfileDeniedMessage(this.profile)),
      );
      return;
    }

    try {
      const history = this.store.get(conversationId);

        const files = tryFileDownload
        ? await downloadAllMessageAttachments(context, this.profile)
        : [];

      if (files.length > 0) {
        const { blocks, summaryForHistory, cacheTexts } = buildClaudeContentFromFiles(
          files,
          text,
        );

        for (const cached of cacheTexts) {
          this.fileStore.add(conversationId, cached.fileName, cached.text);
        }

        await context.sendActivity(
          MessageFactory.text(
            `Analyzing ${files.length === 1 ? `**${files[0].fileName}**` : `**${files.length} files**`}…`,
          ),
        );

        const { text: reply, toolCalls } = await this.claude.completeWithContent(
          history,
          blocks,
          text,
          { userEmail, profile: this.profile },
        );

        for (const call of toolCalls) {
          this.everdeStore.add(
            conversationId,
            call.name,
            call.input,
            call.result,
          );
        }

        this.store.append(conversationId, {
          role: "user",
          content: summaryForHistory,
        });
        this.store.append(conversationId, { role: "assistant", content: reply });

        await context.sendActivity(MessageFactory.text(reply));
        return;
      }

      if (tryFileDownload && files.length === 0) {
        const expectedFile = activityHasUserFileAttachment(attachments);
        logger.warn("attachment.expected_but_missing", {
          conversationId,
          attachmentCount: attachments.length,
          types: attachments.map((a) => a.contentType),
          expectedFile,
        });

        if (expectedFile) {
          await context.sendActivity(
            personalChat
              ? "I see you attached a file, but I could not download it. Wait for the upload progress bar to finish, then send again with the paperclip (PDF, .xlsx, or image). For `.xlsb`, save as `.xlsx` first."
              : GRAPH_PERMISSION_HELP,
          );
          return;
        }

        logger.info("attachment.chrome_only_follow_up", {
          conversationId,
          textLen: text.length,
        });
        // Fall through — text follow-up with Teams HTML chrome, not a new upload.
      }

      if (!text) {
        await context.sendActivity(
          "Send a message, or attach a file (PDF, Excel, image) with your question.",
        );
        return;
      }

      const fileContext = this.fileStore.buildFollowUpContext(conversationId);
      const everdeContext =
        this.everdeStore.buildFollowUpContext(conversationId);
      const contextParts = [fileContext, everdeContext].filter(Boolean);
      const userPayload =
        contextParts.length > 0
          ? `${contextParts.join("\n\n")}\n\n---\n\nUser follow-up: ${text}`
          : text;

      const { text: reply, toolCalls } = await this.claude.complete(
        history,
        userPayload,
        text,
        { userEmail, profile: this.profile },
      );

      for (const call of toolCalls) {
        this.everdeStore.add(
          conversationId,
          call.name,
          call.input,
          call.result,
        );
      }

      const historyNote = [
        fileContext ? "uploaded file" : null,
        everdeContext ? "prior Everde data" : null,
      ]
        .filter(Boolean)
        .join(" + ");

      this.store.append(conversationId, {
        role: "user",
        content: historyNote ? `${text} (re: ${historyNote})` : text,
      });
      this.store.append(conversationId, { role: "assistant", content: reply });

      await context.sendActivity(MessageFactory.text(reply));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";

      logger.error("bot.turn.error", {
        conversationId,
        err,
      });

      if (
        message.includes("not supported") ||
        message.includes("too large")
      ) {
        await context.sendActivity(MessageFactory.text(message));
        return;
      }

      if (err instanceof GraphFileAccessError) {
        await context.sendActivity(MessageFactory.text(err.message));
        return;
      }

      await context.sendActivity(
        MessageFactory.text(
          "Sorry — I could not process that request. Please try again. If you attached a file, confirm it is PDF, .xlsx, or an image under the size limit.",
        ),
      );
    }
  }
}
