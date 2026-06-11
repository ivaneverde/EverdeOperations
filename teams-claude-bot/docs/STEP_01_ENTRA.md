# Step 1 — Entra app registration (Teams Claude bot)

Complete this in the **Microsoft Entra admin center** before Azure Bot or local `.env` setup.

**Time:** ~10 minutes  
**Who:** Global Administrator, Application Administrator, or Cloud Application Administrator

---

## Checklist (fill as you go)

| Item | Where to find it | Your value |
|------|------------------|------------|
| Application (client) ID | App overview | `________________________________` |
| Directory (tenant) ID | App overview | `________________________________` |
| Client secret **value** | Certificates & secrets (copy immediately) | *(paste into `.env` only — never email/chat)* |
| Secret expiration date | Certificates & secrets | `________________________________` |

---

## 1. Open App registrations

1. Go to **[https://entra.microsoft.com](https://entra.microsoft.com)** (or Azure Portal → **Microsoft Entra ID**).
2. Sign in with your **Everde work account**.
3. Left menu → **Identity** → **Applications** → **App registrations**.
4. Click **+ New registration**.

---

## 2. Register the application

| Field | Choose |
|-------|--------|
| **Name** | `Everde Teams Claude Bot` |
| **Supported account types** | **Accounts in this organizational directory only (Single tenant)** |
| **Redirect URI** | Leave **blank** (not needed for a bot) |

Click **Register**.

---

## 3. Copy IDs from Overview

On the app **Overview** page, copy and save:

1. **Application (client) ID** → becomes `MicrosoftAppId` in `.env`
2. **Directory (tenant) ID** → becomes `MicrosoftAppTenantId` in `.env`

Keep this browser tab open.

---

## 4. Create a client secret

1. Left menu → **Certificates & secrets**.
2. Tab **Client secrets** → **+ New client secret**.
3. Description: `Teams Claude bot` (or similar).
4. Expires: **24 months** (recommended; set a calendar reminder before expiry).
5. Click **Add**.
6. **Immediately copy the secret *Value*** (not the Secret ID).  
   You will **not** see it again.

Paste into `teams-claude-bot/.env` as `MicrosoftAppPassword=...`  
**Do not** commit `.env` or paste the secret in Teams chat / email.

---

## 5. Confirm settings (no extra APIs required)

For a standard **Azure Bot + Teams** setup you do **not** need to add Microsoft Graph permissions on this app. Azure Bot Service uses this app identity to authenticate the bot.

Optional verification:

- **Authentication** → Supported accounts = **Single tenant**
- **Expose an API** → leave default (no action)

---

## 6. Save values to `.env`

From the repo:

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
copy .env.example .env
notepad .env
```

Set at minimum:

```env
MicrosoftAppId=<Application (client) ID>
MicrosoftAppPassword=<secret Value from step 4>
MicrosoftAppType=SingleTenant
MicrosoftAppTenantId=<Directory (tenant) ID>
```

Leave `ANTHROPIC_API_KEY=` empty until Step 2 (Anthropic) — or fill if you already have it.

Validate:

```powershell
.\scripts\verify-env.ps1
```

*(Will fail on Anthropic until that key exists — that’s OK for now.)*

---

## Done?

When Step 1 is complete, you should have:

- [ ] App **Everde Teams Claude Bot** visible under App registrations
- [ ] Client ID and tenant ID saved
- [ ] Client secret saved in `.env` only
- [ ] `.env` file created locally

**Next step:** Step 2 — Anthropic API key, then Step 3 — Azure Bot + local run.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Don’t see **New registration** | Need Application Administrator or Global Administrator role |
| Secret expired later | Create a new secret, update App Service / `.env`, restart bot |
| Wrong tenant | Confirm top-right org is **Everde** (not a personal Microsoft account) |
