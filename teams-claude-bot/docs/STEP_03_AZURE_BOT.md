# Step 3 — Azure Bot + local test (Teams path)

**Prerequisites:** Steps 1–2 done (`.env` passes `verify-env.ps1`).

---

## 3A. Start the bot locally

**Terminal 1:**

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
.\scripts\start-local.ps1
```

Leave running. You should see: `server.started` on port **3978**.

---

## 3B. Expose HTTPS with ngrok

ngrok is installed. **One-time:** sign up at [dashboard.ngrok.com](https://dashboard.ngrok.com/signup), copy your authtoken, then:

```powershell
ngrok config add-authtoken YOUR_TOKEN_HERE
```

**Terminal 2** (or ask Cursor to start it):

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
.\scripts\start-ngrok.ps1
```

Copy the **https** forwarding URL from the ngrok window (not http).  
Messaging endpoint: `https://YOUR-SUBDOMAIN.ngrok-free.app/api/messages`

**PowerShell tip:** Do not use angle brackets like `<ngrok-host>` in scripts; they break parsing.

---

## 3C. Create Azure Bot (portal)

1. [Azure Portal](https://portal.azure.com) → **Create a resource** → search **Azure Bot** → **Create**.
2. **Bot handle:** `everde-teams-claude` (any unique name).
3. **Subscription / resource group:** your choice (new RG is fine).
4. **Pricing:** Free (F0) for pilot.
5. **Type of app:** **Single Tenant**.
6. **Creation type:** **Use existing app registration**.
7. **App ID:** `b19da2be-929f-4e71-b838-d65cf3e4cb4c` (Everde Teams Claude Bot).
8. **App tenant ID:** `1efe3bb2-15a5-44f7-b836-7f3dbbc7f5fb`.
9. Create.

After deploy:

1. Bot → **Configuration** → **Messaging endpoint:**  
   `https://<your-ngrok-host>/api/messages` → **Apply**.
2. **Channels** → **Microsoft Teams** → **Apply** (or Configure → Save).

---

## 3D. Test in Web Chat

1. Azure Bot → **Test in Web Chat**.
2. Send: `hello`  
   → You should get the Claude greeting from the bot.

If this fails, check Terminal 1 logs and that ngrok URL matches the messaging endpoint exactly.

---

## 3E. Install in Teams (sideload)

Package already built at:

`teams-claude-bot\ClaudeTeamsBot.zip`

1. **Microsoft Teams** → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**.
2. Select `ClaudeTeamsBot.zip`.
3. Open **Claude** → start **Chat**.
4. Send a message; attach a small PDF or `.xlsx` to test files.

---

## Next

When Web Chat + Teams work locally → **Step 4:** `azure/deploy-app-service.ps1` for production URL (no ngrok).
