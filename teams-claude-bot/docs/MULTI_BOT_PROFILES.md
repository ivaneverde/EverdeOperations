# Multi-bot profiles (Option A) — Claude / Everde HD / Everde Lowes

One **Azure App Service** deploy (`everde-claude-teams-bot`) hosts three **visual** Teams bots. Data still comes from the same Blob feeds; each profile only **loads and exposes** its key-account slice (less snapshot bandwidth / fewer tools).

| Teams name / @mention | Profile | Messaging endpoint | Data |
|-----------------------|---------|--------------------|------|
| **Claude** (`@Claude`) | `full` | `POST /api/messages` | Freight, sales plan, Sales by Item (rep/channel), HD + Lowe's, retail, weather, nursery |
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

## Remaining: Teams install + assignment (Ivan or Aaron)

1. **Teams Admin Center** → Manage apps → Upload custom app → upload each zip (or sideload via Teams desktop: Apps → Manage your apps → Upload a custom app).
2. **Assign apps per tester** (install-time gate; code still denies wrong bot). Status **2026-08-11**: all testers live (Meredith M added — Claude + HD + Lowes).

| User | Email | Claude | Everde HD | Everde Lowes | Install |
|------|-------|:------:|:---------:|:------------:|---------|
| Mark Berchiolli | `mberchiolli@everde.com` | ✓ | ✓ | ✓ | **live** (all 3) |
| Justin Keeler | `jkeeler@everde.com` | ✓ | ✓ | ✓ | **live** (all 3) |
| Meredith McLeod | `mmcleod@everde.com` | ✓ | ✓ | ✓ | **live** (all 3) |
| Spike Mitchell | `smitchell@everde.com` | ✓ | — | — | **pending** (Claude) |
| Harvey Shomper | `hshomper@everde.com` | ✓ | — | — | **pending** (Claude) |
| Mollie Dornak | `mdornak@everde.com` | ✓ | — | — | **pending** (Claude) |
| Rachal Franek | `rfranek@everde.com` | ✓ | — | — | **pending** (Claude) |
| Dave Wright | `dwright@everde.com` | ✓ | — | — | **pending** (Claude) |
| Jae Martin | `jmartin@everde.com` | — | ✓ | — | **live** (HD) |
| Brian Wohlberg | `bwohlberg@everde.com` | — | ✓ | — | **live** (HD) |
| John Gorosave | `jgorosave@everde.com` | — | — | ✓ | **live** (Lowes) |
| Scott Bianucci | `sbianucci@everde.com` | — | ✓ | ✓ | **live** (HD + Lowes) |
| Cory Wible | `cwible@everde.com` | — | ✓ | ✓ | **live** (HD + Lowes) |

   Unknown Everde users (Ivan, Jonathan, ops) keep **full** in code; assign Claude + field bots as needed.
3. In a chat: `@Everde HD` / `@Everde Lowes` / `@Claude` and smoke-test a simple inventory or YTD ask.
4. **Aaron — Graph admin consent:** Already granted for HD/Lowes Entra apps (**Chat.Read.All** / **Files.Read.All**). Re-check only if file attach regresses.

## Code view-rights backstop

Email → role maps in `src/everde/viewRights.ts` (mirror portal `src/lib/auth/viewRights.ts`):

- Wrong bot profile → short denial (no cross-bot suggestion).
- On Claude (`full`): strip HD/Lowe’s/freight/weather/farm tools per role.
- Field bots keep nursery; still strip the other retailer’s YTD tools.

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
