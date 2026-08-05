# Multi-bot profiles (Option A) — Claude / Everde HD / Everde Lowes

One **Azure App Service** deploy (`everde-claude-teams-bot`) hosts three **visual** Teams bots. Data still comes from the same Blob feeds; each profile only **loads and exposes** its key-account slice (less snapshot bandwidth / fewer tools).

| Teams name / @mention | Profile | Messaging endpoint | Data |
|-----------------------|---------|--------------------|------|
| **Claude** (`@Claude`) | `full` | `POST /api/messages` | Freight, sales plan, HD + Lowe's, retail, weather, nursery |
| **Everde HD** (`@Everde HD`) | `hd` | `POST /api/messages/hd` | HD YTD + nursery supply/demand only |
| **Everde Lowes** (`@Everde Lowes`) | `lowes` | `POST /api/messages/lowes` | Lowe's YTD + nursery supply/demand only |

Each bot has its own Teams @mention (Teams cannot share `@Claude` across three apps). Under the hood all three still call Anthropic Claude.

## Provisioned (2026-07-28) — backend ready

| Bot | Entra / botId | Azure Bot | Endpoint |
|-----|---------------|-----------|----------|
| Claude | `b19da2be-929f-4e71-b838-d65cf3e4cb4c` | `everde-teams-claude` | `/api/messages` |
| Everde HD | `7cbf11e1-421e-46f4-873e-907e82eee39c` | `everde-teams-hd` | `/api/messages/hd` |
| Everde Lowes | `ca57d85a-da20-4a99-9460-b2fe5e083ee0` | `everde-teams-lowes` | `/api/messages/lowes` |

App Service `everde-claude-teams-bot` has `MicrosoftAppIdHd` / `MicrosoftAppPasswordHd` / `MicrosoftAppIdLowes` / `MicrosoftAppPasswordLowes`. Health lists `profiles: ["full","hd","lowes"]`.

**Re-provision / rotate secrets:** `scripts/provision-hd-lowes-bots.ps1` (writes gitignored `.env.multi-bot.local`).

**Build packages:**

```powershell
cd teams-claude-bot
.\scripts\build-teams-package.ps1 -Profile hd -BotAppId 7cbf11e1-421e-46f4-873e-907e82eee39c
.\scripts\build-teams-package.ps1 -Profile lowes -BotAppId ca57d85a-da20-4a99-9460-b2fe5e083ee0
```

Outputs: `EverdeHDTeamsBot.zip`, `EverdeLowesTeamsBot.zip` (gitignored).

## Remaining: Teams install (Ivan or Aaron)

1. **Teams Admin Center** → Manage apps → Upload custom app → upload each zip (or sideload via Teams desktop: Apps → Manage your apps → Upload a custom app).
2. Assign / allow for the right users (HD crew vs Lowe’s crew vs everyone for Claude).
3. In a chat: `@Everde HD` / `@Everde Lowes` / `@Claude` and smoke-test a simple inventory or YTD ask.
4. **Aaron — Graph admin consent (group-chat file attach):** On Entra apps **Everde Teams HD Bot** and **Everde Teams Lowes Bot**, grant admin consent for Microsoft Graph application permissions **Chat.Read.All** and **Files.Read.All** (same as Claude). Until then, group-chat files fall back to Claude’s Graph identity when possible; 1:1 file attach works with the bot’s own credentials after the file-parity deploy.

## What we did **not** need

- Three App Service plans / three Node deploys
- Separate Anthropic keys (one `ANTHROPIC_API_KEY` is fine)
- Separate Blob storage (same weekly publish)

## Local test

```powershell
# With only Claude creds → /api/messages only
# With Hd/Lowes env set → all three routes

curl http://localhost:3978/health
```

## Code map

- `src/everde/botProfile.ts` — scopes + prompts
- `src/index.ts` — mounts adapters per profile
- `src/everde/snapshot.ts` / `tools.ts` — load only allowed datasets/tools
