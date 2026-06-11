# Step 4B — App Service via Azure Portal (no CLI)

Use this if `az login` is awkward. Creates an always-on host in **everdeportal**.

## 1. Create Web App

1. Azure Portal → **Create a resource** → **Web App**
2. **Name:** `everde-teams-claude-bot` (must be globally unique; add suffix if taken)
3. **Resource group:** `everdeportal`
4. **Publish:** Code
5. **Runtime:** Node 20 LTS
6. **OS:** Linux
7. **Region:** West US 2 (or nearest)
8. **Pricing:** Basic B1 (or Free F1 for a quick test — Free has cold start)
9. Create

## 2. Application settings (secrets)

Web App → **Settings** → **Environment variables** / **Application settings** → **+ Add**:

| Name | Value (from your `.env`) |
|------|---------------------------|
| `MicrosoftAppId` | (client ID) |
| `MicrosoftAppPassword` | (client secret) |
| `MicrosoftAppType` | `SingleTenant` |
| `MicrosoftAppTenantId` | (tenant ID) |
| `ANTHROPIC_API_KEY` | (Anthropic key) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` |
| `PORT` | `8080` |
| `WEBSITES_PORT` | `8080` |

**Save**

## 3. Startup command

**Configuration** → **General settings** → **Startup Command:**

```text
node dist/index.js
```

Save.

## 4. Deploy code

On your PC:

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
.\scripts\build-deploy-zip.ps1
```

Portal → Web App → **Advanced Tools** → **Go** (Kudu)  
→ **Tools** → **Zip Push Deploy**  
→ drag `deploy.zip`  
→ wait for success

Or: **Deployment Center** → Zip deploy.

## 5. Test

Browser: `https://everde-teams-claude-bot.azurewebsites.net/health`  
→ `{"status":"ok"}`

## 6. Azure Bot endpoint

**everde-teams-claude** (Bot) → **Configuration** → messaging endpoint:

```text
https://everde-teams-claude-bot.azurewebsites.net/api/messages
```

Apply → **Test in Web Chat** → `hello`

You can stop ngrok, cloudflared, and local `node` on your laptop.
