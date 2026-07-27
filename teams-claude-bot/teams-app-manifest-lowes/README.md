# Teams app manifests — Everde HD / Everde Lowes

Same packaging steps as `../teams-app-manifest/README.md`.

1. Copy `color.png` and `outline.png` from the Claude manifest folder (or brand-specific icons).
2. Replace `00000000-0000-0000-0000-000000000000` in **both** `id` and `bots[0].botId` with the Entra **Application (client) ID** for that bot.
3. Zip **only** `manifest.json`, `color.png`, `outline.png` (flat zip).

Azure Bot messaging endpoints (same App Service):

- HD → `https://<app>.azurewebsites.net/api/messages/hd`
- Lowes → `https://<app>.azurewebsites.net/api/messages/lowes`

See `../docs/MULTI_BOT_PROFILES.md`.
