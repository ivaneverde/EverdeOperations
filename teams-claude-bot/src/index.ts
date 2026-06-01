import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import restify from "restify";
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
  const server = restify.createServer();

  server.use(restify.plugins.bodyParser());

  server.get("/health", (_req, res, next) => {
    res.send(200, { status: "ok" });
    return next();
  });

  server.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
  });

  const port = config.PORT;
  server.listen(port, () => {
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
