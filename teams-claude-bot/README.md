# Claude in Microsoft Teams

Production-oriented **Teams chatbot** that forwards user messages to **Anthropic Claude** and returns replies in Teams.

```
Teams client → Azure Bot Service → this Node.js app (/api/messages) → Claude API → reply
```

Microsoft does **not** ship Claude as a native Teams agent. This is the standard enterprise pattern: a **custom bot** registered in Entra ID + **Azure Bot Service**, with your backend holding the Claude API key.

## What you get

- 1:1 and group chat in Teams (personal, team, group scopes)
- **File attachments** — PDF, Excel (.xlsx), images, CSV/text for Claude analysis (see [`docs/FILE_ATTACHMENTS.md`](docs/FILE_ATTACHMENTS.md))
- Multi-turn context per Teams conversation (`/reset` clears history)
- Commands: `/help`, `/reset`
- Typing indicator while Claude runs
- Structured logging (JSON to stdout)
- Secrets via environment variables only
- Health check: `GET /health`

## Prerequisites

| Item | Notes |
|------|--------|
| **Microsoft 365 / Teams** | Admin can allow custom apps |
| **Azure subscription** | Bot Service + hosting (App Service, Container Apps, or VM) |
| **Entra app registration** | Bot identity (`MicrosoftAppId` + client secret) |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **Public HTTPS URL** | Teams must reach `/api/messages` (ngrok for local dev) |

## Project layout

```
teams-claude-bot/
  src/
    index.ts              # HTTP server + Bot Framework adapter
    bot/teamsClaudeBot.ts # Message handling, commands
    services/
      claudeService.ts           # Anthropic API
      teamsAttachmentDownloader.ts
      claudeContentBuilder.ts    # PDF / image / Excel → Claude blocks
      conversationStore.ts
    config/index.ts       # Env validation (zod)
    utils/logger.ts
  teams-app-manifest/     # Teams app package template
  Dockerfile
```

## Start here

**Step-by-step implementation:** [`docs/SETUP_IMPLEMENTATION.md`](docs/SETUP_IMPLEMENTATION.md)

```powershell
cd teams-claude-bot
copy .env.example .env   # fill secrets
npm install
.\scripts\start-local.ps1
# second terminal: ngrok http 3978
```

## Quick start (local)

1. **Install**

   ```powershell
   cd teams-claude-bot
   npm install
   cp .env.example .env
   # Fill MicrosoftAppId, MicrosoftAppPassword, ANTHROPIC_API_KEY
   ```

2. **Run**

   ```powershell
   npm run dev
   ```

3. **Expose HTTPS** (Bot Framework requires HTTPS except Emulator)

   ```powershell
   ngrok http 3978
   ```

4. Point **Azure Bot** messaging endpoint to `https://<your-ngrok-host>/api/messages`.

## Azure setup (recommended path)

### 1. Entra ID — app registration

1. [Entra admin center](https://entra.microsoft.com) → **App registrations** → **New registration**.
2. Name: `Everde Teams Claude Bot`.
3. Supported accounts: **Single tenant** (typical for internal CEO use).
4. Note the **Application (client) ID** → `MicrosoftAppId`.
5. **Certificates & secrets** → New client secret → `MicrosoftAppPassword`.

### 2. Azure Bot Service

1. Azure Portal → **Create a resource** → **Azure Bot**.
2. Type: **Single Tenant** (match Entra app).
3. Creation type: **Use existing app registration** → select the app above.
4. After create: **Configuration** → Messaging endpoint:
   `https://<your-host>/api/messages`
5. **Channels** → Add **Microsoft Teams** channel.

### 3. Host the Node app

**Option A — Azure App Service (simplest)**

1. Create **Web App** (Node 20, Linux).
2. Deploy: GitHub Actions, `az webapp up`, or Docker from this folder.
3. **Configuration** → Application settings: same keys as `.env.example`.
4. Set Bot messaging endpoint to `https://<webapp>.azurewebsites.net/api/messages`.

**Option B — Container Apps / AKS**

Build and push the included `Dockerfile`, set env vars in the container app.

### 4. Teams app package

1. Copy `teams-app-manifest/manifest.json`.
2. Replace both `00000000-0000-0000-0000-000000000000` with your **MicrosoftAppId**.
3. Add `color.png` (192×192) and `outline.png` (32×32) icons.
4. Zip `manifest.json`, icons → `ClaudeTeamsBot.zip`.
5. [Teams Admin Center](https://admin.teams.microsoft.com) → **Teams apps** → **Upload** (org catalog) or sideload for pilot.

CEO experience: install app → open **Claude** → chat like any Teams bot.

## Environment variables

See `.env.example`. Required:

- `MicrosoftAppId`, `MicrosoftAppPassword`
- `ANTHROPIC_API_KEY`

Optional:

- `MicrosoftAppType=SingleTenant` + `MicrosoftAppTenantId` (recommended internally)
- `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`, `CONVERSATION_MAX_TURNS`
- `CLAUDE_SYSTEM_PROMPT` — Everde-specific tone and guardrails

## Security notes

- **Never** commit `.env` or API keys.
- Restrict Teams app distribution to your org (admin approval).
- Use **Single tenant** bot + Entra app for internal-only access.
- Rotate `MicrosoftAppPassword` and `ANTHROPIC_API_KEY` on a schedule.
- For production scale, replace in-memory `ConversationStore` with **Azure Cache for Redis** or Cosmos DB.
- Consider **Azure Key Vault** references in App Service for secrets.
- Add Entra **admin consent** and optional **allowed users** group via Teams app policies.

## Operations

| Endpoint | Purpose |
|----------|---------|
| `POST /api/messages` | Bot Framework (Teams) — do not expose without Bot auth |
| `GET /health` | Load balancer / App Service health probe |

Logs: JSON on stdout → wire to **Application Insights** or Log Analytics.

## Claude vs Copilot

| | Microsoft Copilot | This bot |
|--|-------------------|----------|
| Model | Microsoft / OpenAI stack | **Claude** (Anthropic) |
| Teams native | Yes (licensed) | Custom app |
| Data / policy | M365 compliance boundary | Your Azure + Anthropic terms |
| Best for | M365-wide assistance | **Explicit Claude** experience for leadership |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Bot does not reply in Teams | Messaging endpoint URL, HTTPS, App Service running |
| 401 / unauthorized | `MicrosoftAppId` / password match Entra app |
| Claude errors | `ANTHROPIC_API_KEY`, model name, Anthropic billing |
| Works in Web Chat, not Teams | Teams channel enabled on Azure Bot |

## Related Everde work

The **AI Operations Portal** (`everde-ai-operations`) uses Graph + MSAL for in-browser Teams chat — different pattern (user-delegated Graph), not a Bot Framework bot. This repo folder is the **server-side bot** path Copilot described.

## License

Internal Everde use — not for public distribution.
