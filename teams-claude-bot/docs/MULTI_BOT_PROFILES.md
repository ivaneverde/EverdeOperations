# Multi-bot profiles (Option A) — Claude / Everde HD / Everde Lowes

One **Azure App Service** deploy (`everde-claude-teams-bot`) hosts three **visual** Teams bots. Data still comes from the same Blob feeds; each profile only **loads and exposes** its key-account slice (less snapshot bandwidth / fewer tools).

| Teams name / @mention | Profile | Messaging endpoint | Data |
|-----------------------|---------|--------------------|------|
| **Claude** (`@Claude`) | `full` | `POST /api/messages` | Freight, sales plan, HD + Lowe's, retail, weather, nursery |
| **Everde HD** (`@Everde HD`) | `hd` | `POST /api/messages/hd` | HD YTD + nursery supply/demand only |
| **Everde Lowes** (`@Everde Lowes`) | `lowes` | `POST /api/messages/lowes` | Lowe's YTD + nursery supply/demand only |

Each bot has its own Teams @mention (Teams cannot share `@Claude` across three apps). Under the hood all three still call Anthropic Claude.

## What Aaron / IT create (twice — HD and Lowes)

For each key-account bot:

1. **Entra app registration** (single-tenant, same as Claude bot) → Application (client) ID + client secret.
2. **Azure Bot** resource linked to that app ID.
3. Set messaging endpoint to the shared App Service host:
   - HD: `https://everde-claude-teams-bot.azurewebsites.net/api/messages/hd`
   - Lowes: `https://everde-claude-teams-bot.azurewebsites.net/api/messages/lowes`
4. Add App Service settings (same app as Claude):
   - `MicrosoftAppIdHd` / `MicrosoftAppPasswordHd`
   - `MicrosoftAppIdLowes` / `MicrosoftAppPasswordLowes`
5. Restart the web app. `/health` should list `"hd"` / `"lowes"` in `profiles`.
6. Build Teams packages from manifests:
   - `teams-app-manifest-hd/` → replace GUID with HD app ID; zip with icons
   - `teams-app-manifest-lowes/` → same for Lowes
7. Upload packages in Teams Admin / sideload; grant users access.

Reuse Claude’s Graph permissions pattern on the new apps if group-chat file attach is required (`ChatMessage.Read.Chat`, etc.).

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
