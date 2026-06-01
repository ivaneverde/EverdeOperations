# File attachments in Teams (CEO / IT brief)

## Can users attach files like the Claude app?

**Yes — with the custom bot approach.** Microsoft Teams does not offer a native “Claude with files” agent. Everde’s bot is built so users **paperclip files in the bot chat**; the server downloads them, sends them to **Claude’s document/vision APIs**, and returns analysis in the thread.

This matches how most enterprises get “Claude in Teams” today.

## User experience

1. Open the **Claude** Teams app (1:1 chat recommended for executives).
2. Click **Attach** (paperclip) or drag a file into the chat.
3. Optionally type a question: *“Summarize risks”*, *“Compare regions”*, *“What changed week over week?”*
4. Bot replies with narrative, bullets, and numbers grounded in the file.

## Supported today

| Format | How Claude sees it | Good for |
|--------|-------------------|----------|
| **PDF** | Native document (text + charts) | Board decks, reports |
| **.xlsx** | First sheets → table text (row cap) | Sales, freight, ops metrics |
| **Images** | Vision | Screenshots, photos of charts |
| **CSV / TXT / JSON** | Plain document | Exports, logs |

## Limitations (set expectations)

| Topic | Detail |
|-------|--------|
| **Not native Copilot** | Separate app; governed by your Azure + Anthropic agreements |
| **.xlsb / .docx** | Not supported in v1 — save as **.xlsx** or **PDF** |
| **Huge Excel** | Large sheets are **truncated** (configurable row cap) — for 100MB models use portal/ETL |
| **Follow-up without re-attach** | History stores **text summary** of the turn, not the full file bytes — for deep follow-up on the same deck, re-attach or keep one long thread (future: Claude Files API `file_id` cache) |
| **Group chats** | Teams may prompt **file consent** the first time — users must accept |
| **Secrets** | Do not upload credentials; treat like any cloud AI upload |

## Teams admin requirements

- App manifest: `"supportsFiles": true` (included in this repo).
- Distribute bot via **org catalog**; personal scope is best for CEO pilot.
- Hosting must reach Teams attachment URLs (outbound HTTPS from App Service).

## Security & compliance

- Files pass: **Teams → your Azure bot → Anthropic API**.
- Use **single-tenant** Entra app + restrict who can install the Teams app.
- Log filenames and sizes only (not file contents) unless you enable deeper audit.
- Align with legal on **data processing** for financial/HR documents.

## Roadmap (optional upgrades)

1. **Claude Files API** — upload once per conversation, cheaper follow-ups.
2. **SharePoint / OneDrive links** — fetch via Graph (user-delegated) instead of attach-only.
3. **Everde-specific tools** — call internal APIs (freight JSON, sales plan) from the same bot.
