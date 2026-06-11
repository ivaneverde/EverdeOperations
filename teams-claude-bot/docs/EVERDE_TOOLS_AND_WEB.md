# Everde data + on-demand web search

## Behavior

| Source | When |
|--------|------|
| **Everde snapshot** | Every message — compact freight, sales plan, retail, weather JSON from Azure Blob |
| **Everde tools** | Claude can call for deeper drill-down (`get_freight_dashboard`, etc.) |
| **Web search** | Only when the user asks for live public info (weather, news, "search the web", URLs) |

## Azure App Service settings

Add the same Blob connection as the AI Operations portal:

```
AZURE_STORAGE_CONNECTION_STRING=<from portal .env>
ENABLE_WEB_SEARCH=1
```

Optional path overrides — see `teams-claude-bot/.env.example`.

## Deploy (reliable on B1)

**Recommended:** run-from-package via Blob (avoids stale `wwwroot` / Oryx overwriting `dist/`).

```powershell
cd teams-claude-bot
npm ci --omit=dev
npm run build
# Build deploy-full.zip (dist + package.json + package-lock.json + node_modules) — see scripts/build-deploy-zip.ps1
# Upload to everdeblob / everde-teams-bot / deploy-full.zip
# Set WEBSITE_RUN_FROM_PACKAGE to blob URL + SAS, then restart the app.
```

Verify: `https://everde-claude-teams-bot.azurewebsites.net/health` → `"build":"2026-06-11-everde-tools"`

**Legacy zip deploy** (slim zip + `deploy.sh`) — can leave stale `src/` on the server; prefer run-from-package above.

```powershell
.\scripts\build-deploy-slim-zip.ps1
az webapp config appsettings set -g everdeportal -n everde-claude-teams-bot --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp deployment source config-zip -g everdeportal -n everde-claude-teams-bot --src .\deploy-slim.zip --timeout 1800
```

## Teams test prompts

- Everde: `@Claude what are our top freight carriers YTD?`
- Web: `@Claude search the web for weather in Salem OR today`
