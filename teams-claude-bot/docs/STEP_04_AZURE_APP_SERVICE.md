# Step 4 — Azure App Service (always on, no laptop)

This hosts the bot 24/7 in Azure. You can stop ngrok, cloudflared, and local `node` after this.

## Deploy (one time)

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
winget install Microsoft.AzureCLI
az login
.\scripts\deploy-azure-from-env.ps1
```

Note the printed URL, e.g. `https://everde-teams-claude-bot.azurewebsites.net`

## Point Azure Bot at App Service

1. **everde-teams-claude** (Azure Bot) → **Configuration**
2. **Messaging endpoint:**

   `https://everde-teams-claude-bot.azurewebsites.net/api/messages`

3. **Apply**
4. **Test in Web Chat** → **Start over** → `hello`

Verify health: `https://everde-teams-claude-bot.azurewebsites.net/health`

## What runs where

| Component | Host |
|-----------|------|
| Bot code + Claude API calls | **Azure App Service** |
| Bot identity (Entra) | **Everde Teams Claude Bot** app registration |
| Teams routing | **Azure Bot** + Teams channel |
| Your laptop | **Not required** |

## Redeploy after code changes

```powershell
.\scripts\deploy-azure-from-env.ps1
```

## Cost

- App Service **B1** ~ low monthly cost (covered by startup credits during pilot)
- Anthropic API usage billed separately
