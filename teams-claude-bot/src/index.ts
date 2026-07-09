import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import express, { type Request, type Response } from "express";
import { TeamsClaudeBot } from "./bot/teamsClaudeBot.js";
import { getConfig } from "./config/index.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = getConfig();

  const botFrameworkAuthentication =
    new ConfigurationBotFrameworkAuthentication(process.env);

  const adapter = new CloudAdapter(botFrameworkAuthentication);

  adapter.onTurnError = async (context, error) => {
    logger.error("adapter.turn.error", { error });
    await context.sendActivity(
      "The bot encountered an error. Please try again later.",
    );
  };

  const bot = new TeamsClaudeBot();
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", build: "2026-07-09-file-followup-portal" });
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      await adapter.process(req, res, (context) => bot.run(context));
    } catch (error) {
      const detail =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { error };
      logger.error("api.messages.failed", detail);
      console.error("api.messages.failed", detail);
      if (!res.headersSent) {
        res.status(500).send();
      }
    }
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", { reason });
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaughtException", { error });
  });

  const port = Number(process.env.PORT) || config.PORT;
  app.listen(port, "0.0.0.0", () => {
    logger.info("server.started", {
      port,
      endpoint: `http://localhost:${port}/api/messages`,
    });
  });
}

main().catch((err) => {
  logger.error("server.fatal", { err });
  process.exit(1);
});
