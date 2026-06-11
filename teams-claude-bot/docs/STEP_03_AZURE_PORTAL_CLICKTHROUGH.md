# Azure Portal click-through — Teams Claude bot

Use with ngrok running and local bot on port **3978**.

**Messaging endpoint (paste exactly):**

Use **Cloudflare Tunnel** for Azure Web Chat (ngrok free shows a browser warning that blocks the bot):

```text
https://YOUR-trycloudflare-URL/api/messages
```

Run locally: `cloudflared tunnel --url http://localhost:3978` and copy the `https://….trycloudflare.com` URL.

**Do not use ngrok free `.ngrok-free.dev` for Azure Bot** — Azure cannot pass ngrok’s browser interstitial.

**Entra app (existing):**

| Field | Value |
|-------|--------|
| App name | Everde Teams Claude Bot |
| Application (client) ID | `b19da2be-929f-4e71-b838-d65cf3e4cb4c` |
| Directory (tenant) ID | `1efe3bb2-15a5-44f7-b836-7f3dbbc7f5fb` |

---

## A. Create Azure Bot

1. Azure Portal home → **Create a resource** (or search bar: `Azure Bot`).
2. Search **Azure Bot** → **Create** → **Azure Bot**.
3. **Basics** tab:

   | Field | Value |
   |-------|--------|
   | Bot handle | `everde-teams-claude` (must be globally unique; add digits if taken) |
   | Subscription | Your subscription (with $200 credit) |
   | Resource group | **everdeportal** (existing) |
   | Data residency | Global (default) |
   | Pricing tier | **Free** (F0) |
   | Type of app | **Single Tenant** |
   | Creation type | **Use existing app registration** |
   | App ID | `b19da2be-929f-4e71-b838-d65cf3e4cb4c` |
   | App tenant ID | `1efe3bb2-15a5-44f7-b836-7f3dbbc7f5fb` |

4. **Review + create** → **Create** → wait until deployment completes → **Go to resource**.

---

## B. Messaging endpoint

1. On the Bot resource → left menu **Configuration** (under Settings).
2. **Messaging endpoint** → paste:

   `https://vintage-unblock-alphabet.ngrok-free.dev/api/messages`

3. **Apply** (top of blade).

---

## C. Microsoft Teams channel

1. Left menu **Channels**.
2. Find **Microsoft Teams** → click icon or **Open** / **Configure**.
3. Accept defaults → **Apply** or **Save**.

---

## D. Test in Web Chat

1. Left menu **Test in Web Chat** (or Overview → Test).
2. Type: `hello` → Enter.
3. Expect a greeting from the Claude bot within a few seconds.

**If no reply:**

- PowerShell: confirm `http://localhost:3978/health` returns `{"status":"ok"}`.
- ngrok window must stay open (or tunnel is down).
- Endpoint must end with `/api/messages` (no trailing typo).

---

## E. Install in Teams

1. On your PC: `teams-claude-bot\ClaudeTeamsBot.zip` (already built).
2. Teams → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**.
3. Select the zip → open **Claude** → **Chat**.
4. Send `hello`; try attaching a small PDF or `.xlsx`.

---

## F. Later: production (no ngrok)

When ready, run `azure/deploy-app-service.ps1` and change the messaging endpoint to:

`https://<your-app>.azurewebsites.net/api/messages`
