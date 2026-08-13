import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import express, { type Request, type Response } from "express";
import { TeamsClaudeBot } from "./bot/teamsClaudeBot.js";
import { getConfig } from "./config/index.js";
import type { BotProfile } from "./everde/botProfile.js";
import { logger } from "./utils/logger.js";

function makeAdapter(creds: {
  MicrosoftAppId: string;
  MicrosoftAppPassword: string;
  MicrosoftAppType?: string;
  MicrosoftAppTenantId?: string;
}): CloudAdapter {
  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: creds.MicrosoftAppId,
    MicrosoftAppPassword: creds.MicrosoftAppPassword,
    MicrosoftAppType: creds.MicrosoftAppType,
    MicrosoftAppTenantId: creds.MicrosoftAppTenantId,
  });
  const adapter = new CloudAdapter(auth);
  adapter.onTurnError = async (context, error) => {
    logger.error("adapter.turn.error", { error });
    await context.sendActivity(
      "The bot encountered an error. Please try again later.",
    );
  };
  return adapter;
}

function mountMessages(
  app: express.Express,
  path: string,
  adapter: CloudAdapter,
  bot: TeamsClaudeBot,
  profile: BotProfile,
): void {
  app.post(path, async (req: Request, res: Response) => {
    try {
      await adapter.process(req, res, (context) => bot.run(context));
    } catch (error) {
      const detail =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { error };
      logger.error("api.messages.failed", { path, profile, ...detail });
      console.error("api.messages.failed", { path, profile, ...detail });
      if (!res.headersSent) {
        res.status(500).send();
      }
    }
  });
}

async function main(): Promise<void> {
  const config = getConfig();
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const sharedAuth = {
    MicrosoftAppType: process.env.MicrosoftAppType,
    MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
  };

  // Claude (full) — existing endpoint
  const fullAdapter = makeAdapter({
    MicrosoftAppId: config.MicrosoftAppId,
    MicrosoftAppPassword: config.MicrosoftAppPassword,
    ...sharedAuth,
  });
  const fullBot = new TeamsClaudeBot("full");
  mountMessages(app, "/api/messages", fullAdapter, fullBot, "full");

  const endpoints: { profile: BotProfile; path: string }[] = [
    { profile: "full", path: "/api/messages" },
  ];

  // Everde HD — optional until Entra app + Azure Bot messaging endpoint are set
  if (config.MicrosoftAppIdHd?.trim() && config.MicrosoftAppPasswordHd?.trim()) {
    const hdAdapter = makeAdapter({
      MicrosoftAppId: config.MicrosoftAppIdHd.trim(),
      MicrosoftAppPassword: config.MicrosoftAppPasswordHd.trim(),
      ...sharedAuth,
    });
    mountMessages(
      app,
      "/api/messages/hd",
      hdAdapter,
      new TeamsClaudeBot("hd"),
      "hd",
    );
    endpoints.push({ profile: "hd", path: "/api/messages/hd" });
  }

  if (
    config.MicrosoftAppIdLowes?.trim() &&
    config.MicrosoftAppPasswordLowes?.trim()
  ) {
    const lowesAdapter = makeAdapter({
      MicrosoftAppId: config.MicrosoftAppIdLowes.trim(),
      MicrosoftAppPassword: config.MicrosoftAppPasswordLowes.trim(),
      ...sharedAuth,
    });
    mountMessages(
      app,
      "/api/messages/lowes",
      lowesAdapter,
      new TeamsClaudeBot("lowes"),
      "lowes",
    );
    endpoints.push({ profile: "lowes", path: "/api/messages/lowes" });
  }

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      build: "2026-08-13-fgt-customer",
      profiles: endpoints.map((e) => e.profile),
      endpoints: endpoints.map((e) => e.path),
    });
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
      endpoints: endpoints.map((e) => `http://localhost:${port}${e.path}`),
    });
  });
}

main().catch((err) => {
  logger.error("server.fatal", { err });
  process.exit(1);
});
