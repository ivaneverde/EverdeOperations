# Group chat & channel file analysis (Microsoft Graph)

## Why Graph is required

Microsoft Teams **Bot Framework file APIs only work in 1:1 (personal) chats**. In **group chats** and **channels**, users can attach files in the UI, but the bot activity usually contains only HTML preview chrome — not downloadable bytes.

Everde’s bot uses **Microsoft Graph** to read the same message the user posted and download file attachments from **OneDrive / SharePoint** (where Teams stores chat files).

## IT setup (one-time)

On the **same Entra app** used for the Teams bot (`MicrosoftAppId`):

1. **Microsoft Entra admin center** → **App registrations** → your bot app → **API permissions**
2. **Add a permission** → **Microsoft Graph** → **Application permissions**
3. Add:
   - `Chat.Read.All` — read chat messages (group + 1:1) as the app
   - `Files.Read.All` — resolve SharePoint / OneDrive sharing URLs to file bytes
4. Click **Grant admin consent for Everde** (required)
5. Ensure **`MicrosoftAppTenantId`** is set on the App Service (Everde tenant GUID)

### Teams app package (RSC)

Manifest `1.0.2+` includes resource-specific consent:

- `ChatMessage.Read.Chat` — read messages in group chats where the app is installed
- `ChannelMessage.Read.Group` — read channel messages in teams where the app is installed

After updating the manifest, **upload a new Teams app package** and have users **upgrade** or reinstall the app in meeting / sales group chats.

## User flow (executive / sales meetings)

1. Add **Claude** to the group chat (or use an existing sales / exec chat with the bot).
2. User **paperclips** a workbook or PDF **in the same message** as the question.
3. Bot replies **“Analyzing …”** then analytics grounded in the file.
4. Follow-up questions in-thread use conversation history (text summary of the file turn).

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Bot says Graph denied access (403) | Admin consent for `Chat.Read.All` + `Files.Read.All` |
| Bot answers without file data in group chat | Reinstall Teams app after manifest upgrade; confirm bot is a **member** of the chat |
| Personal chat works, group does not | Graph permissions or missing app reinstall in that chat |
| `.xlsb` | Save as `.xlsx` first |

## Verify deploy

`GET https://everde-claude-teams-bot.azurewebsites.net/health` → `"build":"2026-07-01-graph-group-files"`

## Architecture

```text
User attaches file in group chat
  → Teams stores file in OneDrive (shared with chat members)
  → Bot receives message activity (text + HTML chrome)
  → Bot calls Graph GET /chats/{id}/messages/{messageId}
  → For each reference attachment: Graph /shares/{encoded-url}/driveItem → downloadUrl
  → Excel/PDF → Claude analysis → reply in thread
```
