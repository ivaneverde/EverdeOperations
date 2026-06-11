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

```powershell
cd teams-claude-bot
.\scripts\build-deploy-slim-zip.ps1
az webapp config appsettings set -g everdeportal -n everde-claude-teams-bot --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp deployment source config-zip -g everdeportal -n everde-claude-teams-bot --src .\deploy-slim.zip --timeout 1800
```

Verify: `https://everde-claude-teams-bot.azurewebsites.net/health` → `"build":"2026-06-11-everde-tools"`

Quick code-only push (if `node_modules` already on server):

```powershell
.\scripts\build-dist-only-zip.ps1
az webapp config appsettings set -g everdeportal -n everde-claude-teams-bot --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false
az webapp deploy -g everdeportal -n everde-claude-teams-bot --src-path .\deploy-dist-only.zip --type zip --restart true
```

## Teams test prompts

- Everde: `@Claude what are our top freight carriers YTD?`
- Web: `@Claude search the web for weather in Salem OR today`
