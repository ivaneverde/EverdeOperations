# Implementation start — Everde Teams × Claude

Follow these phases in order. **Phase 1** can be done today on a dev machine; **Phase 2** needs Azure admin; **Phase 3** is CEO pilot.

---

## Phase 1 — Local bot (≈30 min)

### 1.1 Entra app registration (IT)

1. [Entra](https://entra.microsoft.com) → **App registrations** → **New registration**
2. Name: `Everde Teams Claude Bot`
3. Supported accounts: **Single tenant**
4. Copy **Application (client) ID** → `MicrosoftAppId`
5. **Certificates & secrets** → New client secret → copy value → `MicrosoftAppPassword`
6. Copy **Directory (tenant) ID** → `MicrosoftAppTenantId`

### 1.2 Anthropic (you or IT)

1. [console.anthropic.com](https://console.anthropic.com) → API key
2. Ensure billing enabled for production use

### 1.3 Configure & run locally

```powershell
cd teams-claude-bot
copy .env.example .env
# Edit .env — paste the three secrets + tenant ID:
#   MicrosoftAppType=SingleTenant
#   MicrosoftAppTenantId=<tenant-guid>

npm install
.\scripts\verify-env.ps1
.\scripts\start-local.ps1
```

In a **second terminal**:

```powershell
ngrok http 3978
```

Copy the `https://….ngrok-free.app` host.

### 1.4 Azure Bot (connect channel to your laptop)

1. Azure Portal → **Create** → **Azure Bot**
2. Use existing app registration → select the Entra app from 1.1
3. **Configuration** → Messaging endpoint: `https://<ngrok-host>/api/messages`
4. **Channels** → Microsoft Teams → Save
5. **Test in Web Chat** — send “hello”; you should get Claude’s greeting

### 1.5 Test files in Teams (sideload)

```powershell
.\scripts\build-teams-package.ps1 -BotAppId "<MicrosoftAppId>"
```

Teams → **Apps** → **Manage your apps** → **Upload an app** → `ClaudeTeamsBot.zip`  
Open the bot in **personal chat**, attach a small PDF or `.xlsx`, ask a question.

---

## Phase 2 — Production host (≈1 hr)

### 2.1 Deploy App Service

```powershell
cd teams-claude-bot
.\azure\deploy-app-service.ps1 `
  -MicrosoftAppId "<guid>" `
  -MicrosoftAppPassword "<secret>" `
  -AnthropicApiKey "<key>" `
  -MicrosoftAppTenantId "<tenant-guid>"
```

Note the printed `https://….azurewebsites.net/api/messages` URL.

### 2.2 Point Azure Bot to production

1. Azure Bot → **Configuration** → Messaging endpoint → production URL (not ngrok)
2. Confirm `GET https://<app>/health` returns `{"status":"ok"}`

### 2.3 Org-wide Teams app

1. Rebuild package: `.\scripts\build-teams-package.ps1 -BotAppId "<guid>"`
2. [Teams Admin Center](https://admin.teams.microsoft.com) → **Teams apps** → **Upload new app**
3. Set availability policy (pilot group or whole org)

---

## Phase 3 — CEO pilot

| Step | Action |
|------|--------|
| Audience | Start with **1:1 personal chat** (best file attach UX) |
| Test pack | PDF board deck, one `.xlsx` metrics file, one screenshot |
| Guardrails | Optional `CLAUDE_SYSTEM_PROMPT` in App Service settings |
| Support | `/help`, `/reset`; IT monitors App Service logs |

---

## Checklist

- [ ] Entra app + secret
- [ ] Anthropic API key
- [ ] `.env` passes `verify-env.ps1`
- [ ] Local bot + ngrok responds in Web Chat
- [ ] Teams sideload package installed
- [ ] File attach → analysis works (PDF + xlsx)
- [ ] App Service deployed
- [ ] Azure Bot endpoint → production URL
- [ ] Admin catalog upload for pilot users

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Web Chat 401 | App ID/password mismatch; check Entra secret not expired |
| Teams silent | Endpoint must be HTTPS; Teams channel enabled on Azure Bot |
| File not read | Use personal chat; check `supportsFiles` in manifest; re-upload |
| Claude error | Model name, API key, Anthropic rate limits |

See also: [FILE_ATTACHMENTS.md](./FILE_ATTACHMENTS.md)
