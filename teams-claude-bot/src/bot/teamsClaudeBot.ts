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

const HELP_TEXT = `**Claude in Teams**

Chat naturally, or **attach files** for analysis (summaries, Q&A, light analytics).

**Supported attachments**
- PDF (charts, reports, scans)
- Excel \`.xlsx\` (first sheets → table analysis)
- Images (PNG, JPG, GIF, WebP)
- Text / CSV / JSON / code files

**Not supported in chat:** \`.xlsb\`, Word \`.docx\` (export to PDF or Excel first)

**File uploads:** Works in **group chats**, **channels**, and **1:1** — attach with the paperclip and ask your question in the same message.

**Everde Operations Portal**
- Freight, sales plan, retail, weather, and nursery metrics are loaded from the portal each turn — ask naturally (e.g. *"How much did we spend on freight this week?"*).
- Uploaded files stay in context for follow-up questions in the same chat — no need to re-attach unless you switch files.

**Commands**
- \`/help\` — this message
- \`/reset\` — clear conversation history

Tip: Add a short question with your file, e.g. *"What are the top freight risks in this workbook?"*`;

export class TeamsClaudeBot extends ActivityHandler {
  private readonly claude: ClaudeService;
  private readonly store: ConversationStore;
  private readonly fileStore: ConversationFileStore;

  constructor() {
    super();
    const config = getConfig();
    this.claude = new ClaudeService(config);
    this.store = new ConversationStore(config.CONVERSATION_MAX_TURNS);
    this.fileStore = new ConversationFileStore();

    this.onMembersAdded(async (context, next) => {
      const members = context.activity.membersAdded ?? [];
      for (const member of members) {
        if (member.id !== context.activity.recipient?.id) {
          await context.sendActivity(
            MessageFactory.text(
              "Hello — I am **Claude** in Teams. Ask questions, or **attach a file** (PDF, Excel, image) for analysis. Type `/help` for details.",
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
      await context.sendActivity(MessageFactory.text(HELP_TEXT));
      return;
    }

    if (command === "/reset" || command === "reset") {
      this.store.clear(conversationId);
      this.fileStore.clear(conversationId);
      await context.sendActivity("Conversation history cleared for this chat.");
      return;
    }

    await context.sendActivity({ type: ActivityTypes.Typing });

    try {
      const history = this.store.get(conversationId);

      const files = tryFileDownload
        ? await downloadAllMessageAttachments(context)
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

        const reply = await this.claude.completeWithContent(
          history,
          blocks,
          text,
        );

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
      const userPayload = fileContext
        ? `${fileContext}\n\n---\n\nUser follow-up: ${text}`
        : text;

      const reply = await this.claude.complete(history, userPayload, text);

      this.store.append(conversationId, {
        role: "user",
        content: fileContext ? `${text} (re: uploaded file)` : text,
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
